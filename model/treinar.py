from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset, Subset


DEFAULT_PAIRS = Path("dados/pares_outfits.npz")
DEFAULT_OUTPUT = Path("model/match_model.pt")
DEFAULT_HISTORY = Path("model/historico_treino.csv")


class PairDataset(Dataset):
    def __init__(
        self,
        emb_a: np.ndarray,
        emb_b: np.ndarray,
        labels: np.ndarray,
        mean: np.ndarray,
        std: np.ndarray,
        augment_swap: bool = False,
    ) -> None:
        self.emb_a = ((emb_a - mean) / std).astype(np.float32)
        self.emb_b = ((emb_b - mean) / std).astype(np.float32)
        self.labels = labels.astype(np.float32)
        self.augment_swap = augment_swap

    def __len__(self) -> int:
        return len(self.labels)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        a = self.emb_a[index]
        b = self.emb_b[index]
        if self.augment_swap and random.random() < 0.5:
            a, b = b, a
        return (
            torch.from_numpy(a),
            torch.from_numpy(b),
            torch.tensor([self.labels[index]], dtype=torch.float32),
        )


class MatchNet(nn.Module):
    def __init__(self, input_dim: int = 523, hidden_dim: int = 512, dropout: float = 0.25) -> None:
        super().__init__()
        latent_dim = max(64, hidden_dim // 2)
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.dropout = dropout

        self.encoder = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, latent_dim),
            nn.LayerNorm(latent_dim),
            nn.GELU(),
        )
        self.head = nn.Sequential(
            nn.Linear(latent_dim * 3, hidden_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, 128),
            nn.GELU(),
            nn.Dropout(dropout * 0.5),
            nn.Linear(128, 1),
        )

    def forward(self, emb_a: torch.Tensor, emb_b: torch.Tensor) -> torch.Tensor:
        za = self.encoder(emb_a)
        zb = self.encoder(emb_b)
        pair_features = torch.cat(
            (torch.abs(za - zb), za * zb, 0.5 * (za + zb)),
            dim=1,
        )
        return self.head(pair_features)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Treina o modelo de compatibilidade.")
    parser.add_argument("--pairs", type=Path, default=DEFAULT_PAIRS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--history", type=Path, default=DEFAULT_HISTORY)
    parser.add_argument("--epochs", type=int, default=25)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--hidden-dim", type=int, default=512)
    parser.add_argument("--dropout", type=float, default=0.25)
    parser.add_argument("--val-size", type=float, default=0.2)
    parser.add_argument("--patience", type=int, default=6)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", choices=("auto", "cpu", "mps"), default="auto")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--no-swap-augmentation", action="store_true")
    return parser.parse_args()


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def choose_device(name: str) -> torch.device:
    mps_available = hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
    if name == "mps" and not mps_available:
        raise RuntimeError("MPS nao esta disponivel neste Mac.")
    if name == "mps":
        return torch.device("mps")
    if name == "auto" and mps_available:
        return torch.device("mps")
    return torch.device("cpu")


def load_pairs(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if not path.exists():
        raise FileNotFoundError(f"Arquivo de pares nao encontrado: {path}")
    data = np.load(path, allow_pickle=False)
    required = {"emb_a", "emb_b", "y"}
    missing = required.difference(data.files)
    if missing:
        raise ValueError(f"Chaves ausentes em {path}: {sorted(missing)}")

    emb_a = data["emb_a"].astype(np.float32)
    emb_b = data["emb_b"].astype(np.float32)
    labels = (data["y"].astype(np.float32).reshape(-1) > 0).astype(np.float32)
    if emb_a.shape != emb_b.shape or emb_a.ndim != 2:
        raise ValueError(f"Embeddings invalidos: {emb_a.shape} e {emb_b.shape}")
    if len(labels) != len(emb_a):
        raise ValueError("Quantidade de labels diferente da quantidade de pares.")
    if not np.isfinite(emb_a).all() or not np.isfinite(emb_b).all():
        raise ValueError("Embeddings contem NaN ou infinito.")
    if labels.sum() == 0 or labels.sum() == len(labels):
        raise ValueError("O dataset precisa ter exemplos positivos e negativos.")
    return emb_a, emb_b, labels


def split_indices(labels: np.ndarray, val_size: float, seed: int) -> tuple[np.ndarray, np.ndarray]:
    indices = np.arange(len(labels))
    try:
        from sklearn.model_selection import train_test_split

        train_idx, val_idx = train_test_split(
            indices,
            test_size=val_size,
            random_state=seed,
            stratify=labels,
        )
        return np.asarray(train_idx), np.asarray(val_idx)
    except Exception:
        rng = np.random.default_rng(seed)
        rng.shuffle(indices)
        val_count = max(1, int(len(indices) * val_size))
        return indices[val_count:], indices[:val_count]


def fit_standardizer(
    emb_a: np.ndarray,
    emb_b: np.ndarray,
    train_idx: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    train_vectors = np.concatenate((emb_a[train_idx], emb_b[train_idx]), axis=0)
    mean = train_vectors.mean(axis=0).astype(np.float32)
    std = train_vectors.std(axis=0).astype(np.float32)
    std[std < 1e-6] = 1.0
    return mean, std


def metrics(labels: np.ndarray, scores: np.ndarray, threshold: float) -> dict[str, float]:
    predictions = (scores >= threshold).astype(np.float32)
    tp = float(((predictions == 1) & (labels == 1)).sum())
    tn = float(((predictions == 0) & (labels == 0)).sum())
    fp = float(((predictions == 1) & (labels == 0)).sum())
    fn = float(((predictions == 0) & (labels == 1)).sum())
    accuracy = (tp + tn) / max(1.0, tp + tn + fp + fn)
    precision = tp / max(1.0, tp + fp)
    recall = tp / max(1.0, tp + fn)
    f1 = 2 * precision * recall / max(1e-8, precision + recall)
    auc = float("nan")
    try:
        from sklearn.metrics import roc_auc_score

        if len(np.unique(labels)) == 2:
            auc = float(roc_auc_score(labels, scores))
    except Exception:
        pass
    return {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "auc": auc,
    }


def best_threshold(labels: np.ndarray, scores: np.ndarray) -> tuple[float, float]:
    best_t = 0.5
    best_f1 = -1.0
    for threshold in np.linspace(0.05, 0.95, 91):
        current = metrics(labels, scores, float(threshold))["f1"]
        if current > best_f1:
            best_t, best_f1 = float(threshold), current
    return best_t, best_f1


def train_epoch(
    model: MatchNet,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
) -> float:
    model.train()
    total_loss = 0.0
    total_count = 0
    for emb_a, emb_b, labels in loader:
        emb_a, emb_b, labels = emb_a.to(device), emb_b.to(device), labels.to(device)
        optimizer.zero_grad(set_to_none=True)
        loss = criterion(model(emb_a, emb_b), labels)
        loss.backward()
        optimizer.step()
        count = labels.size(0)
        total_loss += float(loss.detach().cpu()) * count
        total_count += count
    return total_loss / max(1, total_count)


@torch.no_grad()
def evaluate(
    model: MatchNet,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
) -> tuple[float, np.ndarray, np.ndarray]:
    model.eval()
    losses: list[float] = []
    all_scores: list[np.ndarray] = []
    all_labels: list[np.ndarray] = []
    for emb_a, emb_b, labels in loader:
        emb_a, emb_b, labels = emb_a.to(device), emb_b.to(device), labels.to(device)
        logits = model(emb_a, emb_b)
        losses.append(float(criterion(logits, labels).cpu()) * labels.size(0))
        all_scores.append(torch.sigmoid(logits).cpu().numpy().reshape(-1))
        all_labels.append(labels.cpu().numpy().reshape(-1))
    count = sum(len(values) for values in all_labels)
    return sum(losses) / max(1, count), np.concatenate(all_scores), np.concatenate(all_labels)


def save_checkpoint(
    path: Path,
    model: MatchNet,
    mean: np.ndarray,
    std: np.ndarray,
    threshold: float,
    epoch: int,
    evaluation: dict[str, float],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "input_dim": model.input_dim,
            "hidden_dim": model.hidden_dim,
            "dropout": model.dropout,
            "mean": mean,
            "std": std,
            "threshold": threshold,
            "epoch": epoch,
            "metrics": evaluation,
        },
        path,
    )


def save_history(path: Path, rows: list[dict[str, float]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["epoch", "train_loss", "val_loss", "accuracy", "precision", "recall", "f1", "auc", "threshold"]
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def load_model(path: Path, device: torch.device) -> tuple[MatchNet, dict[str, Any]]:
    try:
        checkpoint = torch.load(path, map_location=device, weights_only=False)
    except TypeError:
        checkpoint = torch.load(path, map_location=device)
    model = MatchNet(
        input_dim=int(checkpoint["input_dim"]),
        hidden_dim=int(checkpoint["hidden_dim"]),
        dropout=float(checkpoint["dropout"]),
    ).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model, checkpoint


@torch.no_grad()
def predict_score(
    embedding_a: np.ndarray,
    embedding_b: np.ndarray,
    checkpoint_path: str | Path = DEFAULT_OUTPUT,
    device: str = "auto",
) -> float:
    torch_device = choose_device(device)
    model, checkpoint = load_model(Path(checkpoint_path), torch_device)
    mean = np.asarray(checkpoint["mean"], dtype=np.float32)
    std = np.asarray(checkpoint["std"], dtype=np.float32)
    a = (np.asarray(embedding_a, dtype=np.float32).reshape(1, -1) - mean) / std
    b = (np.asarray(embedding_b, dtype=np.float32).reshape(1, -1) - mean) / std
    logits = model(torch.from_numpy(a).to(torch_device), torch.from_numpy(b).to(torch_device))
    return float(torch.sigmoid(logits).cpu().numpy().reshape(-1)[0])


def main() -> None:
    args = parse_args()
    set_seed(args.seed)
    device = choose_device(args.device)
    emb_a, emb_b, labels = load_pairs(args.pairs)
    train_idx, val_idx = split_indices(labels, args.val_size, args.seed)
    mean, std = fit_standardizer(emb_a, emb_b, train_idx)

    train_dataset = PairDataset(emb_a, emb_b, labels, mean, std, not args.no_swap_augmentation)
    val_dataset = PairDataset(emb_a, emb_b, labels, mean, std, False)
    train_loader = DataLoader(Subset(train_dataset, train_idx), batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(Subset(val_dataset, val_idx), batch_size=args.batch_size, shuffle=False)

    model = MatchNet(emb_a.shape[1], args.hidden_dim, args.dropout).to(device)
    positives = float(labels[train_idx].sum())
    negatives = float(len(train_idx) - positives)
    pos_weight = torch.tensor([negatives / max(1.0, positives)], device=device)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", factor=0.5, patience=2)

    print(f"[treino] pares={len(labels)} treino={len(train_idx)} validacao={len(val_idx)}")
    print(f"[treino] dimensao={emb_a.shape[1]} device={device}")
    best_val_loss = float("inf")
    without_improvement = 0
    history: list[dict[str, float]] = []

    for epoch in range(1, args.epochs + 1):
        train_loss = train_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, scores, val_labels = evaluate(model, val_loader, criterion, device)
        scheduler.step(val_loss)
        evaluation = metrics(val_labels, scores, args.threshold)
        threshold, _ = best_threshold(val_labels, scores)
        row = {
            "epoch": float(epoch),
            "train_loss": train_loss,
            "val_loss": val_loss,
            **evaluation,
            "threshold": threshold,
        }
        history.append(row)
        save_history(args.history, history)
        print(
            f"[treino] epoch={epoch:03d} train_loss={train_loss:.4f} "
            f"val_loss={val_loss:.4f} acc={evaluation['accuracy']:.3f} "
            f"f1={evaluation['f1']:.3f} auc={evaluation['auc']:.3f}"
        )

        if val_loss < best_val_loss - 1e-5:
            best_val_loss = val_loss
            without_improvement = 0
            save_checkpoint(args.output, model, mean, std, threshold, epoch, evaluation)
            print(f"[treino] melhor modelo salvo em {args.output}")
        else:
            without_improvement += 1
            if without_improvement >= args.patience:
                print("[treino] parada antecipada")
                break

    print(f"[treino] concluido. Historico salvo em {args.history}")


if __name__ == "__main__":
    main()

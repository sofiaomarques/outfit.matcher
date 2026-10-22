import type { ReactElement } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';

const GAP = 20;
const PADDING = 24;

interface GridListProps<T> {
  data: T[];
  /** Largura máxima de cada célula (como o `maxCrossAxisExtent` do Flutter). */
  maxItemWidth: number;
  /** Largura / altura de cada célula (o `childAspectRatio` do Flutter). */
  aspectRatio: number;
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactElement;
}

/** Grade com quantas colunas couberem, mínimo 2, e células de no máximo `maxItemWidth`. */
export function GridList<T>({ data, maxItemWidth, aspectRatio, keyExtractor, renderItem }: GridListProps<T>) {
  const { width } = useWindowDimensions();
  const columns = Math.max(2, Math.floor((width - PADDING * 2 + GAP) / (maxItemWidth + GAP)));
  // Completa a última linha com vazios: sem isso, a célula sozinha esticaria.
  const padding = (columns - (data.length % columns)) % columns;
  const rows: (T | null)[] = [...data, ...Array<null>(padding).fill(null)];

  return (
    <FlatList
      key={columns}
      data={rows}
      numColumns={columns}
      keyExtractor={(item, index) => (item ? keyExtractor(item) : `empty-${index}`)}
      columnWrapperStyle={{ gap: GAP }}
      contentContainerStyle={{ gap: GAP }}
      renderItem={({ item }) => (
        <View style={[styles.cell, { maxWidth: maxItemWidth, aspectRatio }]}>
          {item ? renderItem(item) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({ cell: { flex: 1 } });

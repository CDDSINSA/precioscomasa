export async function readPromotionPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  while (true) {
    const { data, error } = await fetchPage(rows.length, rows.length + 499);
    if (error) throw new Error(`No se pudieron cargar todas las promociones: ${error.message}`);
    if (!data?.length) return rows;
    rows.push(...data);
  }
}

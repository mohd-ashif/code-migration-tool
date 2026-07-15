;
import { Expense } from '../types/expense';
export function useExpenses() {
    const items = ref<Expense[]>([]);
    watch(items, () => localStorage.setItem('expenses', JSON.stringify(items.value)));
    return { items, add: (e: Expense) => items.value = [e, ...items.value], remove: (id: string) => items.value = items.value.filter(x => x.id !== id) };
}
onMounted(() => {
    items.value = JSON.parse(localStorage.getItem('expenses') || '[]');
});
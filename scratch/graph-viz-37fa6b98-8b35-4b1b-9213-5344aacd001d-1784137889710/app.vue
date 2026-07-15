<script setup lang="ts">
  const { items, add, remove } = useExpenses();
  const total = computed(() => items.value.reduce((a, b) => a + b.amount, 0));
</script>

<template>
  <div class="inline-style-1"><h1>Expense Tracker</h1><h2>Total: ₹{{ total }}</h2><ExpenseForm @add="add" /><ExpenseList :items="items" :remove="remove" /></div>
</template>

<style scoped>
.inline-style-1 {
  font-family: sans-serif;
    padding: 20px;
}
</style>

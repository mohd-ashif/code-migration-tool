<script setup lang="ts">
  const props = defineProps<{
  items: any[];
}>();
  
  const emit = defineEmits<{
  (_event: "remove", id:string): void;
}>();
</script>

<template>
  <table><thead><tr><th>Title</th><th>Amount</th><th>Category</th><th>Date</th><th /></tr></thead><tbody><template v-for="i in items" :key="i.id"><tr ><td>{{ i.title }}</td><td>{{ i.amount }}</td><td>{{ i.category }}</td><td>{{ i.date }}</td><td><button @click="emit('remove', i.id)">X</button></td></tr></template></tbody></table>
</template>



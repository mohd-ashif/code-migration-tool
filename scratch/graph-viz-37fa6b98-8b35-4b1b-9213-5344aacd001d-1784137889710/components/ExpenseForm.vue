<script setup lang="ts">
  const emit = defineEmits<{
  (_event: "add", e:any): void;
}>();
  
  const s = ref({title:'',amount:'',category:'General',date:''});
  
  const submitForm = () => {
    emit("add", { ...s.value, id: crypto.randomUUID(), amount: +s.value.amount });
    s.value = {title:'',amount:'',category:'General',date:''};
};
</script>

<template>
  <form @submit.prevent="submitForm"><input v-model="s.title" placeholder="Title" /><input v-model="s.amount" type="number" placeholder="Amount" /><input v-model="s.category" placeholder="Category" /><input v-model="s.date" type="date" /><button>Add</button></form>
</template>



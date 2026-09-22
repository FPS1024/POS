<script setup>
import { useToast } from '../composables/toast';

const { toasts } = useToast();
</script>

<template>
  <div class="toast-wrap">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{ t.message }}</div>
  </div>
</template>

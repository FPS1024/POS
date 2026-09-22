<script setup>
import { X } from 'lucide-vue-next';

defineProps({
  title: { type: String, default: '' },
  wide: Boolean
});

const emit = defineEmits(['close']);
</script>

<template>
  <div class="modal-mask" @mousedown.self="emit('close')">
    <div class="modal" :class="{ wide }">
      <div class="modal-head">
        <h3>{{ title }}</h3>
        <button class="icon-btn" aria-label="关闭" @click="emit('close')">
          <X :size="17" />
        </button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
      <div v-if="$slots.foot" class="modal-foot">
        <slot name="foot" />
      </div>
    </div>
  </div>
</template>

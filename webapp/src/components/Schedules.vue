<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-3xl font-bold">Schedules</h1>
      <button class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
        Create Schedule
      </button>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div v-if="loading" class="p-6 text-center text-gray-500 dark:text-gray-400">
        Loading schedules...
      </div>
      
      <div v-else-if="error" class="p-6 text-center text-red-600 dark:text-red-400">
        {{ error }}
      </div>
      
      <div v-else-if="schedules.length === 0" class="p-6 text-center text-gray-500 dark:text-gray-400">
        No schedules found. Create your first schedule to get started.
      </div>
      
      <div v-else class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cron Expression</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Timezone</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Next Run</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="schedule in schedules" :key="schedule.id" class="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td class="px-6 py-4">
                <div class="font-medium">{{ schedule.name }}</div>
                <div v-if="schedule.description" class="text-sm text-gray-500 dark:text-gray-400">
                  {{ schedule.description }}
                </div>
              </td>
              <td class="px-6 py-4 text-sm font-mono">{{ schedule.cron }}</td>
              <td class="px-6 py-4 text-sm">{{ schedule.timezone || 'UTC' }}</td>
              <td class="px-6 py-4">
                <span
                  class="px-2 py-1 rounded-full text-xs font-medium"
                  :class="schedule.enabled ? 
                    'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' : 
                    'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-400'"
                >
                  {{ schedule.enabled ? 'Active' : 'Disabled' }}
                </span>
              </td>
              <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                {{ formatDate(schedule.nextRun) }}
              </td>
              <td class="px-6 py-4">
                <div class="flex space-x-2">
                  <button class="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                    Edit
                  </button>
                  <button class="text-red-600 dark:text-red-400 hover:underline text-sm">
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../utils/api'

const schedules = ref([])
const loading = ref(true)
const error = ref(null)

const formatDate = (date) => {
  if (!date) return 'N/A'
  return new Date(date).toLocaleString()
}

const loadSchedules = async () => {
  loading.value = true
  error.value = null
  
  try {
    const data = await api.get('/schedules')
    schedules.value = Array.isArray(data) ? data : []
  } catch (err) {
    error.value = err.message
    schedules.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadSchedules()
})
</script>

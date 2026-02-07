<template>
  <div class="space-y-6">
    <h1 class="text-3xl font-bold">Dashboard</h1>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div class="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Schedules</div>
        <div class="text-3xl font-bold text-blue-600 dark:text-blue-400">{{ stats.schedules }}</div>
      </div>
      
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div class="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Jobs</div>
        <div class="text-3xl font-bold text-green-600 dark:text-green-400">{{ stats.jobs }}</div>
      </div>
      
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div class="text-sm text-gray-600 dark:text-gray-400 mb-1">Active Workflows</div>
        <div class="text-3xl font-bold text-purple-600 dark:text-purple-400">{{ stats.workflows }}</div>
      </div>
      
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div class="text-sm text-gray-600 dark:text-gray-400 mb-1">Running Jobs</div>
        <div class="text-3xl font-bold text-orange-600 dark:text-orange-400">{{ stats.running }}</div>
      </div>
    </div>

    <!-- Recent Jobs -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div class="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-xl font-semibold">Recent Jobs</h2>
      </div>
      
      <div v-if="loading" class="p-6 text-center text-gray-500 dark:text-gray-400">
        Loading...
      </div>
      
      <div v-else-if="error" class="p-6 text-center text-red-600 dark:text-red-400">
        {{ error }}
      </div>
      
      <div v-else-if="recentJobs.length === 0" class="p-6 text-center text-gray-500 dark:text-gray-400">
        No recent jobs
      </div>
      
      <div v-else class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Job ID</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Started</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="job in recentJobs" :key="job.id" class="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td class="px-6 py-4 text-sm">{{ job.id }}</td>
              <td class="px-6 py-4 text-sm">{{ job.name }}</td>
              <td class="px-6 py-4 text-sm">
                <span
                  class="px-2 py-1 rounded-full text-xs font-medium"
                  :class="getStatusClass(job.status)"
                >
                  {{ job.status }}
                </span>
              </td>
              <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                {{ formatDate(job.startedAt) }}
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

const stats = ref({
  schedules: 0,
  jobs: 0,
  workflows: 0,
  running: 0
})

const recentJobs = ref([])
const loading = ref(true)
const error = ref(null)

const getStatusClass = (status) => {
  const statusMap = {
    completed: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
    running: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',
    pending: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-400'
  }
  return statusMap[status] || statusMap.pending
}

const formatDate = (date) => {
  if (!date) return 'N/A'
  return new Date(date).toLocaleString()
}

const loadDashboardData = async () => {
  loading.value = true
  error.value = null
  
  try {
    const [statsData, jobsData] = await Promise.all([
      api.get('/stats').catch(() => ({ schedules: 0, jobs: 0, workflows: 0, running: 0 })),
      api.get('/jobs?limit=10').catch(() => [])
    ])
    
    stats.value = statsData
    recentJobs.value = Array.isArray(jobsData) ? jobsData : []
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadDashboardData()
})
</script>

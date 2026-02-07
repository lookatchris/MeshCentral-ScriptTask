import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../components/Dashboard.vue'
import Schedules from '../components/Schedules.vue'
import Remediation from '../components/Remediation.vue'
import Jobs from '../components/Jobs.vue'
import Scripts from '../components/Scripts.vue'
import Nodes from '../components/Nodes.vue'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: Dashboard
  },
  {
    path: '/schedules',
    name: 'Schedules',
    component: Schedules
  },
  {
    path: '/remediation',
    name: 'Remediation',
    component: Remediation
  },
  {
    path: '/jobs',
    name: 'Jobs',
    component: Jobs
  },
  {
    path: '/scripts',
    name: 'Scripts',
    component: Scripts
  },
  {
    path: '/nodes',
    name: 'Nodes',
    component: Nodes
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router

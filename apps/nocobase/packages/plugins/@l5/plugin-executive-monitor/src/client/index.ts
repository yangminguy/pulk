// @l5/plugin-executive-monitor — client (UI shell)
// Executive Monitor: read-only agent task view for Founder.
// NocoBase는 Shell로만 사용한다.

export { ExecutiveMonitor } from './components/ExecutiveMonitor.js';
export { AgentTaskCard } from './components/AgentTaskCard.js';
export type { AgentTask } from './components/AgentTaskCard.js';

export default {
  name: 'executive-monitor',
  title: 'Executive Monitor',
  // TODO: NocoBase Plugin client route 등록
  // registerComponent('ExecutiveMonitor', ExecutiveMonitor)
  // addRoutes([{ path: '/executive-monitor', component: ExecutiveMonitor }])
};

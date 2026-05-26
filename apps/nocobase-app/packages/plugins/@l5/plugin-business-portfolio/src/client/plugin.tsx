import React from 'react';
import { Plugin } from '@nocobase/client';
import { Link } from 'react-router-dom';
import models from './models';
import { BusinessPortfolioPage } from './pages/BusinessPortfolioPage';
import { PMFExperimentsPage } from './pages/PMFExperimentsPage';
import { ControlRoomPage } from './pages/ControlRoomPage';

const IndexPage = () => {
  return (
    <div style={{ padding: 24, background: '#fff', margin: 24, minHeight: '80vh' }}>
      <h1>L5 Business OS - Vertical Flows</h1>
      <p>Select a module to proceed:</p>
      <ul style={{ fontSize: '16px', lineHeight: '2' }}>
        <li><Link to="/admin/business-portfolio">Business Portfolio (Idea -&gt; Founder Fit -&gt; Create Business)</Link></li>
        <li><Link to="/admin/pmf-experiments">PMF Experiments (Experiment -&gt; Run Metrics -&gt; PMF Score)</Link></li>
        <li><Link to="/admin/control-room">Control Room (Decisions & Alerts)</Link></li>
      </ul>
    </div>
  );
};

export class PluginBusinessPortfolioClient extends Plugin {
  async load() {
    if ((this as any).flowEngine) {
      (this as any).flowEngine.registerModels(models);
    }

    this.app.router.add('admin.l5-index', {
      path: '/admin/l5-index',
      Component: IndexPage,
    });

    this.app.router.add('admin.business-portfolio', {
      path: '/admin/business-portfolio',
      Component: BusinessPortfolioPage,
    });
    
    this.app.router.add('admin.pmf-experiments', {
      path: '/admin/pmf-experiments',
      Component: PMFExperimentsPage,
    });
    
    this.app.router.add('admin.control-room', {
      path: '/admin/control-room',
      Component: ControlRoomPage,
    });
  }
}

export default PluginBusinessPortfolioClient;

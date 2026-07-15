import { Plugin } from '@nocobase/server';
import founderInstructionsCollection from './collections/founder_instructions';
import ceoInterpretationsCollection from './collections/ceo_interpretations';
import agentTasksCollection from './collections/agent_tasks';
import agentHandoffsCollection from './collections/agent_handoffs';
import * as instructionActions from './actions/instructions.action';

export class PluginOrchestrationServer extends Plugin {
  async load() {
    this.db.collection(founderInstructionsCollection);
    this.db.collection(ceoInterpretationsCollection);
    this.db.collection(agentTasksCollection);
    this.db.collection(agentHandoffsCollection);

    this.app.resource({
      name: 'chat',
      actions: {
        submitInstruction: instructionActions.submitChatInstruction,
        generateWorkflow: instructionActions.generateWorkflowAction,
      },
    });

    this.app.resource({
      name: 'founder_instructions',
      actions: {
        create: instructionActions.createInstruction,
      },
    });

    this.app.resource({
      name: 'ceo_interpretations',
      actions: {
        create: instructionActions.createInterpretation,
      },
    });

    this.app.resource({
      name: 'agent_tasks',
      actions: {
        create: instructionActions.createTask,
        updateStatus: instructionActions.updateTaskStatus,
        listByAgent: instructionActions.listTasksByAgent,
        listByStatus: instructionActions.listTasksByStatus,
      },
    });

    this.app.resource({
      name: 'agent_handoffs',
      actions: {
        create: instructionActions.createHandoff,
        listByTaskId: instructionActions.listByTaskId,
      },
    });

    this.app.acl.allow('chat', ['submitInstruction', 'generateWorkflow'], 'loggedIn');

    await this.db.sync({ alter: { drop: false } });
  }
}

export default PluginOrchestrationServer;

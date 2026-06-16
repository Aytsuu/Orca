// src/components/islands/features/PlanView.tsx
import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RotateCcw,
  Check,
  ArrowRight,
  Info
} from 'lucide-react';
import {
  addToast
} from '../../../stores/projectStore';
import { QueryProvider } from '../providers/QueryProvider';
import { Modal } from '../ui/Modal';

interface Task {
  id: string;
  title: string;
  owner: string;
  due: string;
  isNew?: boolean;
  hasGap?: boolean;
  gapText?: string;
}

interface Phase {
  title: string;
  timeframe: string;
  tasks: Task[];
}

interface ProjectPlan {
  title: string;
  updatedAt: string;
  phases: Phase[];
}

interface PlanViewProps {
  projectId: string;
}

const PlanViewInner: React.FC<PlanViewProps> = ({ projectId }) => {
  // Simulation Role (to test both Approver and Viewer views)
  const [userRole] = useState<'APPROVER' | 'VIEWER'>('APPROVER');

  // Modals state
  const [isRevertOpen, setIsRevertOpen] = useState(false);
  const [isFinalizeOpen, setIsFinalizeOpen] = useState(false);

  // Active version index (0 is current, 1 is previous, etc.)
  const [versionIndex, setVersionIndex] = useState(0);

  // Local state for plan (mock plan feature)
  const defaultPlan: ProjectPlan = {
    title: `Project Plan - ${projectId}`,
    updatedAt: 'No approved plan yet',
    phases: [
      {
        title: 'Phase 1 - Foundation',
        timeframe: 'Pending',
        tasks: [],
      },
    ],
  };

  const [currentPlan, setCurrentPlan] = useState<ProjectPlan>(defaultPlan);
  const [planHistory, setPlanHistory] = useState<ProjectPlan[]>([defaultPlan]);
  const [revertsRemaining, setRevertsRemaining] = useState<number>(3);
  const [finalizedAt, setFinalizedAt] = useState<string | undefined>(undefined);

  useEffect(() => {
    const freshPlan: ProjectPlan = {
      title: `Project Plan - ${projectId}`,
      updatedAt: 'No approved plan yet',
      phases: [
        {
          title: 'Phase 1 - Foundation',
          timeframe: 'Pending',
          tasks: [],
        },
      ],
    };
    setCurrentPlan(freshPlan);
    setPlanHistory([freshPlan]);
    setRevertsRemaining(3);
    setFinalizedAt(undefined);
    setVersionIndex(0);
  }, [projectId]);



  // Get active plan based on versionIndex
  const activePlan = planHistory[versionIndex] || currentPlan;
  const totalVersions = planHistory.length;
  const versionDisplayNum = totalVersions - versionIndex;

  // Calculate gaps
  let gapCount = 0;
  activePlan.phases.forEach((phase: Phase) => {
    phase.tasks.forEach((task: Task) => {
      if (task.hasGap) gapCount++;
    });
  });

  const handleRevertConfirm = () => {
    if (revertsRemaining <= 0) {
      addToast('error', 'Revert limit reached! Max 3 reverts allowed.');
      setIsRevertOpen(false);
      return;
    }
    if (planHistory.length <= 1) {
      addToast('warning', 'No older version of the plan exists.');
      setIsRevertOpen(false);
      return;
    }

    const nextHistory = planHistory.slice(1);
    const previousPlan = nextHistory[0];
    setCurrentPlan(previousPlan);
    setPlanHistory(nextHistory);
    setRevertsRemaining(revertsRemaining - 1);
    setIsRevertOpen(false);
    setVersionIndex(0); // reset version index to current
    addToast('success', `Plan reverted. Reverts remaining: ${revertsRemaining - 1}`);
  };

  const handleFinalizeConfirm = () => {
    setFinalizedAt(new Date().toLocaleDateString());
    setIsFinalizeOpen(false);
    addToast('success', 'Plan finalized. All members notified.');
  };

  const isApprover = userRole === 'APPROVER';

  return (
    <div className="flex-grow flex flex-col bg-background h-[calc(100vh-112px)] overflow-hidden">

      {/* Main Content Layout */}
      <div className="flex-grow flex flex-col md:flex-row relative overflow-hidden md:p-4 md:gap-4">
        {/* Timeline Column (Center/Left) */}
        <div className="flex-1 flex flex-col bg-surface md:rounded-xl md:overflow-hidden">
          {/* Plan Controls Bar */}
          {isApprover ? (
            <div className="h-[52px] px-8 border-b border-border-subtle flex items-center justify-between shrink-0">
              {/* Version Selector */}
              <div className="flex items-center gap-3">
                <button
                  disabled={versionIndex >= totalVersions - 1}
                  onClick={() => setVersionIndex(prev => prev + 1)}
                  className="btn-ghost p-1 h-8 w-8 rounded-sm disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                  title="Previous Version"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-text-primary font-semibold">
                  Version {versionDisplayNum} of {totalVersions}
                </span>
                <button
                  disabled={versionIndex <= 0}
                  onClick={() => setVersionIndex(prev => prev - 1)}
                  className="btn-ghost p-1 h-8 w-8 rounded-sm disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                  title="Newer Version"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Center Badges / Action Row */}
              <div className="flex items-center gap-4">
                {gapCount > 0 && (
                  <span className="category-badge badge--editor text-xs py-1 px-3 flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{gapCount} gaps flagged</span>
                  </span>
                )}

                <button
                  onClick={() => setIsRevertOpen(true)}
                  disabled={revertsRemaining <= 0 || totalVersions <= 1}
                  className="btn-secondary py-1 px-3.5 text-xs font-semibold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Revert</span>
                </button>

                <button
                  onClick={() => setIsFinalizeOpen(true)}
                  disabled={finalizedAt !== undefined}
                  className="btn-primary py-1 px-3.5 text-xs font-semibold flex items-center gap-1.5"
                >
                  {finalizedAt ? (
                    <>
                      <span>Finalized</span>
                      <Check className="w-3.5 h-3.5 text-success" />
                    </>
                  ) : (
                    <>
                      <span>Finalize & Sync</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Read Only view notice for Viewer */
            <div className="bg-primary-muted border-b border-primary/20 px-8 py-3 flex items-center gap-3 shrink-0">
              <Info className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs font-semibold text-text-primary tracking-wide">
                This plan was finalized on {finalizedAt || 'Jun 12'}. Comment via chat.
              </span>
            </div>
          )}

          {/* Timeline Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-10 py-12 flex justify-center">
            <div className="max-w-[760px] w-full flex flex-col gap-8">
              <div>
                <h1 className="text-display-sm text-text-primary font-bold tracking-tight">
                  {activePlan.title}
                </h1>
                <p className="text-xs text-text-muted mt-2">
                  {activePlan.updatedAt}
                </p>
              </div>

              <hr className="border-border-subtle" />

              {/* Timeline Phases */}
              <div className="flex flex-col gap-10">
                {activePlan.phases.map((phase: Phase, pIdx: number) => (
                  <div key={pIdx} className="flex flex-col gap-5">
                    <div className="flex items-center gap-4">
                      <h2 className="text-lg font-bold text-text-primary">
                        {phase.title}
                      </h2>
                      <span className="category-badge badge--viewer text-[11px] py-0.5 px-2 font-semibold">
                        {phase.timeframe}
                      </span>
                    </div>

                    {/* Tasks in Phase */}
                    <div className="flex flex-col gap-4 pl-6 ml-3">
                      {phase.tasks.map((task: Task, tIdx: number) => {
                        const stepNum = String(tIdx + 1).padStart(2, '0');

                        let rowStyle = 'border-l-2 border-transparent hover:bg-surface-raised/40';
                        let badge = null;

                        if (task.isNew) {
                          rowStyle = 'border-l-2 border-primary bg-primary-muted/10 hover:bg-primary-muted/20';
                          badge = <span className="category-badge badge--approver text-[9px] py-0.5 px-1.5 font-bold">NEW</span>;
                        } else if (task.hasGap) {
                          rowStyle = 'border-l-2 border-warning bg-warning/5 hover:bg-warning/10';
                          badge = (
                            <span className="text-warning text-xs font-semibold flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>{task.gapText || 'Missing Owner'}</span>
                            </span>
                          );
                        }

                        return (
                          <div
                            key={task.id}
                            className={`flex items-start gap-4 transition-all p-2 -mx-2 rounded-sm ${rowStyle}`}
                          >
                            <span className="font-mono text-xs text-text-muted mt-1 select-none">
                              {stepNum}
                            </span>

                            <div className="flex-grow">
                              <div className="flex items-center gap-3">
                                <h3 className="text-sm font-bold text-text-primary">
                                  {task.title}
                                </h3>
                                {badge}
                              </div>

                              <p className="text-xs text-text-muted mt-1 select-text">
                                Owner: <span className="font-semibold text-text-secondary">{task.owner}</span> · Due: <span className="font-semibold text-text-secondary">{task.due}</span>
                              </p>
                            </div>
                          </div>
                        );
                      })}

                      {phase.tasks.length === 0 && (
                        <div className="text-xs text-text-muted italic">No tasks in this phase.</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6.4 Revert Confirmation Modal */}
      <Modal
        isOpen={isRevertOpen}
        onClose={() => setIsRevertOpen(false)}
        title="REVERT PLAN"
        isWarning={true}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            This will restore Version 1 and permanently remove all comments on the current version.
          </p>
          <p className="text-sm text-text-muted font-medium">
            You have {revertsRemaining} reverts remaining ({revertsRemaining - 1} after this).
          </p>
          <div className="flex justify-end gap-3 border-t border-border-subtle pt-4 mt-2">
            <button
              onClick={() => setIsRevertOpen(false)}
              className="btn-secondary py-1.5 px-5 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleRevertConfirm}
              className="btn-primary bg-warning text-text-inverse hover:bg-warning/80 py-1.5 px-5 text-xs font-semibold flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Revert to v1</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </Modal>

      {/* 6.5 Finalize & Sync Modal */}
      <Modal
        isOpen={isFinalizeOpen}
        onClose={() => setIsFinalizeOpen(false)}
        title="FINALIZE PLAN"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            This plan will be synced to all project members. They'll be notified and can comment via chat.
          </p>
          <div className="flex justify-end gap-3 border-t border-border-subtle pt-4 mt-2">
            <button
              onClick={() => setIsFinalizeOpen(false)}
              className="btn-secondary py-1.5 px-5 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleFinalizeConfirm}
              className="btn-primary py-1.5 px-5 text-xs font-semibold flex items-center gap-1.5"
            >
              <span>Finalize & Sync</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export const PlanView: React.FC<PlanViewProps> = (props) => {
  return (
    <QueryProvider>
      <PlanViewInner {...props} />
    </QueryProvider>
  );
};

export default PlanView;

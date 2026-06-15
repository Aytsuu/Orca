// src/components/islands/features/PlanView.tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RotateCcw,
  Check,
  X,
  ArrowRight,
  Info,
  Zap
} from 'lucide-react';
import {
  activeProjectState,
  selectProject,
  acceptChange,
  rejectChange,
  acceptAllChanges,
  revertPlan,
  finalizePlan,
  addToast
} from '../../../stores/projectStore';
import { Modal } from '../ui/Modal';

interface PlanViewProps {
  projectId: string;
}

export const PlanView: React.FC<PlanViewProps> = ({ projectId }) => {
  const detail = useStore(activeProjectState);

  // Simulation Role (to test both Approver and Viewer views)
  const [userRole, setUserRole] = useState<'APPROVER' | 'VIEWER'>('APPROVER');

  // Modals state
  const [isRevertOpen, setIsRevertOpen] = useState(false);
  const [isFinalizeOpen, setIsFinalizeOpen] = useState(false);

  // Active version index (0 is current, 1 is previous, etc.)
  const [versionIndex, setVersionIndex] = useState(0);

  useEffect(() => {
    selectProject(projectId);
  }, [projectId]);

  if (!detail || detail.projectId !== projectId) {
    return (
      <div className="flex-grow flex items-center justify-center text-text-muted select-none">
        Loading workspace data...
      </div>
    );
  }

  // Get active plan based on versionIndex
  const activePlan = detail.planHistory[versionIndex] || detail.currentPlan;
  const totalVersions = detail.planHistory.length;
  const versionDisplayNum = totalVersions - versionIndex;

  // Calculate gaps
  let gapCount = 0;
  activePlan.phases.forEach(phase => {
    phase.tasks.forEach(task => {
      if (task.hasGap) gapCount++;
    });
  });

  const handleRevertConfirm = () => {
    revertPlan();
    setIsRevertOpen(false);
    setVersionIndex(0); // reset version index to current
  };

  const handleFinalizeConfirm = () => {
    finalizePlan();
    setIsFinalizeOpen(false);
  };

  const isApprover = userRole === 'APPROVER';
  const hasPending = detail.pendingChanges.length > 0;

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
                  disabled={detail.revertsRemaining <= 0 || totalVersions <= 1}
                  className="btn-secondary py-1 px-3.5 text-xs font-semibold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Revert</span>
                </button>

                <button
                  onClick={() => setIsFinalizeOpen(true)}
                  disabled={hasPending || detail.finalizedAt !== undefined}
                  className="btn-primary py-1 px-3.5 text-xs font-semibold flex items-center gap-1.5"
                >
                  {detail.finalizedAt ? (
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
                This plan was finalized on {detail.finalizedAt || 'Jun 12'}. Comment via chat.
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
              {activePlan.phases.map((phase, pIdx) => (
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
                    {phase.tasks.map((task, tIdx) => {
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

        {/* 6.3 Review Panel Sidebar (Right, Approver Only) */}
        {isApprover && (
          <aside className="w-full md:w-[28%] md:min-w-[300px] md:max-w-[380px] border-t md:border-0 md:rounded-xl bg-surface p-6 flex flex-col gap-6 shrink-0 md:h-full overflow-hidden">
            <div className="flex justify-between items-center">
              <span className="section-label">PENDING CHANGES</span>
              <span className="category-badge badge--approver text-xs font-bold py-0.5 px-2">
                {detail.pendingChanges.length}
              </span>
            </div>

            <div className="flex-grow overflow-y-auto flex flex-col gap-3 pr-1">
              {detail.pendingChanges.map((change) => (
                <div
                  key={change.id}
                  className="bg-background border border-border-subtle rounded-sm p-4 flex flex-col gap-3 fade-up"
                >
                  <div>
                    <span className="text-[10px] font-bold text-primary tracking-widest uppercase flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      <span>{change.type.replace('_', ' ')}</span>
                    </span>
                    <h4 className="text-sm font-bold text-text-primary mt-1 leading-snug">
                      "{change.taskTitle}"
                    </h4>
                    <p className="text-xs text-text-muted mt-1">
                      {change.detail}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptChange(change.id)}
                      className="btn-primary py-1.5 px-4 text-xs font-semibold flex-grow flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Accept</span>
                    </button>
                    <button
                      onClick={() => rejectChange(change.id)}
                      className="btn-secondary py-1.5 px-4 text-xs font-semibold text-error border-error/20 hover:bg-error/5 flex items-center justify-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              ))}

              {!hasPending && (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-1.5">
                  <Check className="w-6 h-6 text-text-muted mx-auto" />
                  <p className="text-xs text-text-muted font-semibold mt-1">
                    No pending changes.
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Review complete.
                  </p>
                </div>
              )}
            </div>
          </aside>
        )}
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
            You have {detail.revertsRemaining} reverts remaining ({detail.revertsRemaining - 1} after this).
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
            This plan will be synced to all 4 project members. They'll be notified and can comment via chat.
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
export default PlanView;

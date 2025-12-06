"use client";

import { useState } from "react";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Response } from "./elements/response";
import { NotebookViewer } from "./notebook-viewer";

export interface TaskItem {
  id: string;
  type: "task" | "event";
  title: string;
  content: string;
  status: "completed" | "in_progress" | "pending" | "scheduled";
  symbol: string;
  time?: string;
  date: string;
  notebookName: string;
  markdown?: string;
  metadata?: {
    confidence: number;
    notes?: string;
    associated_date?: string;
  };
}

interface TaskItemProps {
  task: TaskItem;
}

export function TaskItemComponent({ task }: TaskItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  const statusColors = {
    completed: "text-green-600 dark:text-green-400",
    in_progress: "text-yellow-600 dark:text-yellow-400",
    pending: "text-blue-600 dark:text-blue-400",
    scheduled: "text-purple-600 dark:text-purple-400",
  };

  const statusDots = {
    completed: "●",
    in_progress: "◐",
    pending: "○",
    scheduled: "◉",
  };

  const typeColors = {
    task: "border-l-blue-500/50 dark:border-l-blue-400/50",
    event: "border-l-green-500/50 dark:border-l-green-400/50",
  };

  return (
    <>
      <div
        className={cn(
          "group cursor-pointer rounded-md border-l-2 px-2 py-1.5 transition-colors hover:bg-sidebar-accent",
          typeColors[task.type]
        )}
        onClick={() => setIsOpen(true)}
      >
        <div className="flex items-start gap-2 min-w-0">
          <span className={cn("text-xs mt-0.5 shrink-0", statusColors[task.status])}>
            {statusDots[task.status]}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h4 className="text-xs font-medium text-sidebar-foreground truncate">
                {task.title}
              </h4>
              {task.time && (
                <span className="text-[10px] text-sidebar-foreground/50 shrink-0">
                  {task.time}
                </span>
              )}
            </div>
            <p className="text-[10px] text-sidebar-foreground/60 line-clamp-1">
              {task.content.replace(/^[•/XO]\s*/, "").substring(0, 50)}
              {task.content.length > 50 ? "..." : ""}
            </p>
          </div>
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{task.symbol}</span>
              <span>{task.title}</span>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={cn(statusColors[task.status])}
              >
                {task.status.replace("_", " ")}
              </Badge>
              {task.time && (
                <Badge variant="outline">{task.time}</Badge>
              )}
              <Badge variant="outline">{task.type}</Badge>
              <span className="text-sm text-muted-foreground">
                {task.date}
              </span>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <h5 className="text-sm font-semibold mb-2">Content</h5>
              <p className="text-sm">{task.content}</p>
            </div>

            {task.markdown && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 border-b pb-2">
                  <span className="text-sm font-semibold">Preview</span>
                </div>
                <NotebookViewer text={task.markdown} />
              </div>
            )}

            {task.metadata && (
              <div className="rounded-lg border bg-card p-4">
                <h5 className="text-sm font-semibold mb-2">Metadata</h5>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-medium">Confidence:</span>{" "}
                    {task.metadata.confidence}%
                  </p>
                  {task.metadata.notes && (
                    <p>
                      <span className="font-medium">Notes:</span>{" "}
                      {task.metadata.notes}
                    </p>
                  )}
                  {task.metadata.associated_date && (
                    <p>
                      <span className="font-medium">Date:</span>{" "}
                      {task.metadata.associated_date}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


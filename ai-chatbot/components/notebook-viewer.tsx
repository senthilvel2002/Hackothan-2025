"use client";

import { useState, useMemo } from "react";
import { Response } from "./elements/response";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Clock, FileText, Heart, MoreHorizontal, TrendingUp } from "lucide-react";

interface NotebookData {
  notebook_name: string;
  pages: Array<{
    page_index: number;
    page_metadata: {
      file_name: string;
      date_headers: string[];
      layout: string;
      thread_id: string | null;
    };
    extracted_items: Array<{
      type: "task" | "event" | "note" | "emotion" | "other";
      symbol: string;
      status: string;
      time: string | null;
      content: string;
      metadata: {
        confidence: number;
        notes: string;
        associated_date: string | null;
        page_index: number;
      };
    }>;
    page_markdown: string | null;
    errors: string[];
  }>;
  markdown_export: string;
  updates: Array<{
    item_id: string | null;
    change: string;
  }>;
  errors: string[];
}

function parseNotebookData(text: string): NotebookData | null {
  try {
    // First, try to parse the entire text as JSON
    try {
      const parsed = JSON.parse(text);
      if (parsed.notebook_name && parsed.pages && Array.isArray(parsed.pages)) {
        return parsed as NotebookData;
      }
    } catch {
      // If that fails, try to find JSON object in the text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.notebook_name && parsed.pages && Array.isArray(parsed.pages)) {
          return parsed as NotebookData;
        }
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

// Chart Data Interface
interface ChartData {
  label: string;
  value: number;
  color: string;
}


function PieChart({ data, size = 200 }: { data: ChartData[]; size?: number }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  
  const center = size / 2;
  const radius = size / 2 - 10;
  let currentAngle = -90; // Start from top

  // Separate items with value > 0 (for chart) and all items (for legend)
  const chartData = data.filter((item) => item.value > 0);
  const allData = data; // Show all items in legend

  const paths = chartData.map((item) => {
    const percentage = item.value / total;
    const angle = percentage * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const startAngleRad = (startAngle * Math.PI) / 180;
    const endAngleRad = (endAngle * Math.PI) / 180;

    const x1 = center + radius * Math.cos(startAngleRad);
    const y1 = center + radius * Math.sin(startAngleRad);
    const x2 = center + radius * Math.cos(endAngleRad);
    const y2 = center + radius * Math.sin(endAngleRad);

    const largeArcFlag = angle > 180 ? 1 : 0;

    const pathData = [
      `M ${center} ${center}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      "Z",
    ].join(" ");

    return { pathData, color: item.color, label: item.label, value: item.value, percentage };
  });

  return (
    <div className="flex flex-col items-center gap-4">
      {total > 0 ? (
        <svg width={size} height={size} className="drop-shadow-sm">
          {paths.map((path, idx) => (
            <path
              key={idx}
              d={path.pathData}
              fill={path.color}
              stroke="white"
              strokeWidth="2"
              className="transition-opacity hover:opacity-80"
            />
          ))}
        </svg>
      ) : (
        <div className="w-[200px] h-[200px] flex items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-full">
          <span className="text-sm text-muted-foreground">No data</span>
        </div>
      )}
      <div className="flex flex-wrap gap-3 justify-center">
        {allData.map((item, idx) => {
          const percentage = total > 0 ? (item.value / total) * 100 : 0;
          const hasValue = item.value > 0;
          
          return (
            <div 
              key={idx} 
              className={cn(
                "flex items-center gap-2",
                !hasValue && "opacity-60"
              )}
            >
              <div
                className={cn(
                  "w-3 h-3 rounded-full",
                  !hasValue && "border-2 border-dashed border-muted-foreground"
                )}
                style={{ 
                  backgroundColor: hasValue ? item.color : "transparent",
                  borderColor: hasValue ? item.color : item.color
                }}
              />
              <span className={cn(
                "text-sm font-medium",
                !hasValue && "text-muted-foreground"
              )}>
                {item.label}: {item.value} {total > 0 && `(${Math.round(percentage)}%)`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotebookStructuredView({ data }: { data: NotebookData }) {
  // Calculate analytics - detect actual statuses and symbols from data
  const analytics = useMemo(() => {
    const allItems = data.pages.flatMap((page) => page.extracted_items);
    
    // Count by type
    const typeCounts = allItems.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Count by status - use actual statuses from data
    const statusCounts = allItems.reduce((acc, item) => {
      const status = item.status || "none";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Count by symbol - use actual symbols from data
    const symbolCounts = allItems.reduce((acc, item) => {
      const symbol = item.symbol || "unknown";
      acc[symbol] = (acc[symbol] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Task status breakdown
    const taskItems = allItems.filter((item) => item.type === "task");
    const taskStatusCounts = taskItems.reduce((acc, item) => {
      const status = item.status || "none";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Event status breakdown
    const eventItems = allItems.filter((item) => item.type === "event");
    const eventStatusCounts = eventItems.reduce((acc, item) => {
      const status = item.status || "none";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get all unique statuses found in data
    const allStatuses = new Set<string>();
    allItems.forEach((item) => {
      if (item.status) allStatuses.add(item.status);
    });

    // Get all unique symbols found in data
    const allSymbols = new Set<string>();
    allItems.forEach((item) => {
      if (item.symbol) allSymbols.add(item.symbol);
    });

    return {
      totalItems: allItems.length,
      totalPages: data.pages.length,
      typeCounts,
      statusCounts,
      symbolCounts,
      taskStatusCounts,
      eventStatusCounts,
      allStatuses: Array.from(allStatuses),
      allSymbols: Array.from(allSymbols),
    };
  }, [data]);

  // Color mapping for statuses
  const statusColors: Record<string, string> = {
    completed: "#10b981", // green
    in_progress: "#f59e0b", // amber
    incomplete: "#3b82f6", // blue
    scheduled: "#8b5cf6", // purple
    none: "#9ca3af", // gray
  };

  // Color mapping for symbols
  const symbolColors: Record<string, string> = {
    "•": "#3b82f6", // blue - task
    "O": "#10b981", // green - event
    "X": "#10b981", // green - completed
    "/": "#f59e0b", // amber - in progress
    "filled O": "#10b981", // green - completed event
    "=": "#a855f7", // purple - emotion
    "-": "#6b7280", // gray - note
  };

  // Get color for status or symbol
  const getColor = (key: string, isStatus: boolean = true): string => {
    if (isStatus) {
      return statusColors[key] || "#6b7280";
    }
    return symbolColors[key] || "#9ca3af";
  };

  // Prepare pie chart data for types
  const typeChartData: ChartData[] = [
    {
      label: "Tasks",
      value: analytics.typeCounts.task || 0,
      color: "#3b82f6",
    },
    {
      label: "Events",
      value: analytics.typeCounts.event || 0,
      color: "#10b981",
    },
    {
      label: "Notes",
      value: analytics.typeCounts.note || 0,
      color: "#6b7280",
    },
    {
      label: "Emotions",
      value: analytics.typeCounts.emotion || 0,
      color: "#a855f7",
    },
    {
      label: "Other",
      value: analytics.typeCounts.other || 0,
      color: "#f59e0b",
    },
  ];

  // Prepare chart data for actual statuses found in data (all items)
  const overallStatusChartData: ChartData[] = analytics.allStatuses
    .map((status) => ({
      label: status.charAt(0).toUpperCase() + status.slice(1).replace("_", " "),
      value: analytics.statusCounts[status] || 0,
      color: getColor(status, true),
    }))
    .sort((a, b) => b.value - a.value);

  // Prepare chart data for task statuses (only actual statuses found in tasks)
  const taskStatusChartData: ChartData[] = Object.keys(analytics.taskStatusCounts)
    .map((status) => ({
      label: status.charAt(0).toUpperCase() + status.slice(1).replace("_", " "),
      value: analytics.taskStatusCounts[status] || 0,
      color: getColor(status, true),
    }))
    .sort((a, b) => b.value - a.value);

  // Prepare chart data for event statuses
  const eventStatusChartData: ChartData[] = Object.keys(analytics.eventStatusCounts)
    .map((status) => ({
      label: status.charAt(0).toUpperCase() + status.slice(1).replace("_", " "),
      value: analytics.eventStatusCounts[status] || 0,
      color: getColor(status, true),
    }))
    .sort((a, b) => b.value - a.value);

  // Prepare chart data for symbols (only actual symbols found in data)
  const symbolChartData: ChartData[] = analytics.allSymbols
    .map((symbol) => ({
      label: symbol === "•" ? "Bullet (•)" : 
             symbol === "O" ? "Circle (O)" :
             symbol === "X" ? "X (Completed)" :
             symbol === "/" ? "Slash (/) In Progress" :
             symbol === "filled O" ? "Filled Circle" :
             symbol === "=" ? "Equals (=) Emotion" :
             symbol === "-" ? "Dash (-) Note" :
             symbol.startsWith("custom:") ? `Custom: ${symbol.replace("custom:", "")}` :
             symbol,
      value: analytics.symbolCounts[symbol] || 0,
      color: getColor(symbol, false),
    }))
    .sort((a, b) => b.value - a.value);

  const typeIcons = {
    task: CheckCircle2,
    event: Clock,
    note: FileText,
    emotion: Heart,
    other: MoreHorizontal,
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            {data.notebook_name}
          </CardTitle>
          <CardDescription>
            Comprehensive analytics and structured view of your Bullet Journal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {analytics.totalItems}
              </div>
              <div className="text-sm text-muted-foreground">Total Items</div>
            </div>
            <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-4 border border-green-200 dark:border-green-800">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {analytics.totalPages}
              </div>
              <div className="text-sm text-muted-foreground">Pages</div>
            </div>
            <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {analytics.statusCounts.completed || 0}
              </div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
            <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {analytics.statusCounts.incomplete || 0}
              </div>
              <div className="text-sm text-muted-foreground">Incomplete</div>
            </div>
          </div>
          {(analytics.statusCounts.in_progress || analytics.statusCounts.scheduled || analytics.statusCounts.none) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              {analytics.statusCounts.in_progress > 0 && (
                <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                    {analytics.statusCounts.in_progress}
                  </div>
                  <div className="text-sm text-muted-foreground">In Progress</div>
                </div>
              )}
              {analytics.statusCounts.scheduled > 0 && (
                <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {analytics.statusCounts.scheduled}
                  </div>
                  <div className="text-sm text-muted-foreground">Scheduled</div>
                </div>
              )}
              {analytics.statusCounts.none > 0 && (
                <div className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                  <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                    {analytics.statusCounts.none}
                  </div>
                  <div className="text-sm text-muted-foreground">No Status</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analytics Charts - Pie Charts */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Items by Type
            </CardTitle>
            <CardDescription>Distribution of different content types</CardDescription>
          </CardHeader>
          <CardContent>
            <PieChart data={typeChartData} size={180} />
          </CardContent>
        </Card>

        {taskStatusChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Task Status
              </CardTitle>
              <CardDescription>Status breakdown for tasks (from actual data)</CardDescription>
            </CardHeader>
            <CardContent>
              <PieChart data={taskStatusChartData} size={180} />
            </CardContent>
          </Card>
        )}

        {overallStatusChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Circle className="w-5 h-5" />
                Overall Status
              </CardTitle>
              <CardDescription>Status breakdown for all items (from actual data)</CardDescription>
            </CardHeader>
            <CardContent>
              <PieChart data={overallStatusChartData} size={180} />
            </CardContent>
          </Card>
        )}

        {eventStatusChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Event Status
              </CardTitle>
              <CardDescription>Status breakdown for events (from actual data)</CardDescription>
            </CardHeader>
            <CardContent>
              <PieChart data={eventStatusChartData} size={180} />
            </CardContent>
          </Card>
        )}

        {symbolChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Symbols Distribution
              </CardTitle>
              <CardDescription>Distribution of symbols used (from actual data)</CardDescription>
            </CardHeader>
            <CardContent>
              <PieChart data={symbolChartData} size={180} />
            </CardContent>
          </Card>
        )}
      </div>


      {/* Pages Content */}
      <div className="space-y-6">
        {data.pages.map((page, pageIdx) => (
          <Card key={pageIdx} className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border-b">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-base px-3 py-1">
                    Page {page.page_index}
                  </Badge>
                  {page.page_metadata.date_headers.map((date, idx) => (
                    <Badge key={idx} variant="secondary" className="text-sm">
                      {date}
                    </Badge>
                  ))}
                </div>
                <div className="text-sm text-muted-foreground">
                  {page.extracted_items.length} items
                </div>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                <p><strong>File:</strong> {page.page_metadata.file_name}</p>
                {page.page_metadata.layout && (
                  <p><strong>Layout:</strong> {page.page_metadata.layout}</p>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {/* Group items by type */}
              {["task", "event", "note", "emotion", "other"].map((itemType) => {
                const itemsOfType = page.extracted_items.filter(
                  (item) => item.type === itemType
                );
                if (itemsOfType.length === 0) return null;

                const Icon = typeIcons[itemType as keyof typeof typeIcons] || FileText;
                const typeLabels = {
                  task: "Tasks / To-Dos",
                  event: "Events",
                  note: "Notes",
                  emotion: "Emotions",
                  other: "Other",
                };

                return (
                  <div key={itemType} className="mb-6 last:mb-0">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                      <h4 className="text-base font-semibold capitalize">
                        {typeLabels[itemType as keyof typeof typeLabels]}
                      </h4>
                      <Badge variant="outline" className="ml-auto">
                        {itemsOfType.length}
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {itemsOfType.map((item, itemIdx) => (
                        <div
                          key={itemIdx}
                          className={cn(
                            "rounded-lg border p-4 transition-all hover:shadow-md",
                            item.type === "task" &&
                              "border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800",
                            item.type === "event" &&
                              "border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-800",
                            item.type === "note" &&
                              "border-gray-200 bg-gray-50/50 dark:bg-gray-950/20 dark:border-gray-800",
                            item.type === "emotion" &&
                              "border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800",
                            item.type === "other" &&
                              "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800"
                          )}
                        >
                          <div className="flex items-start gap-2 flex-wrap mb-2">
                            <Badge
                              variant={
                                item.status === "completed"
                                  ? "default"
                                  : item.status === "in_progress"
                                  ? "secondary"
                                  : "outline"
                              }
                              className="shrink-0"
                            >
                              <span className="mr-1">{item.symbol}</span>
                              {item.type}
                            </Badge>
                            {item.time && (
                              <Badge variant="outline" className="shrink-0">
                                <Clock className="w-3 h-3 mr-1" />
                                {item.time}
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={cn(
                                "shrink-0",
                                item.status === "completed" &&
                                  "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700",
                                item.status === "in_progress" &&
                                  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700"
                              )}
                            >
                              {item.status === "completed" && (
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                              )}
                              {item.status === "in_progress" && (
                                <Circle className="w-3 h-3 mr-1" />
                              )}
                              {item.status}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium mt-2 leading-relaxed">
                            {item.content}
                          </p>
                          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                            {item.metadata.notes && (
                              <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                {item.metadata.notes}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              Confidence: {item.metadata.confidence}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {page.errors.length > 0 && (
                <Card className="mt-4 border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800">
                  <CardHeader>
                    <CardTitle className="text-red-700 dark:text-red-400 text-base">
                      Errors
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-300 space-y-1">
                      {page.errors.map((error, errIdx) => (
                        <li key={errIdx}>{error}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {data.errors.length > 0 && (
        <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800">
          <CardHeader>
            <CardTitle className="text-red-700 dark:text-red-400">Global Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-300 space-y-1">
              {data.errors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function NotebookViewer({ text }: { text: string }) {
  const notebookData = parseNotebookData(text);
  const [viewMode, setViewMode] = useState<"markdown" | "structured">("markdown");

  if (!notebookData) {
    // If it's not notebook data, just render as normal text
    return <Response>{text}</Response>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b pb-2">
        <Button
          variant={viewMode === "markdown" ? "default" : "ghost"}
          size="sm"
          onClick={() => setViewMode("markdown")}
        >
          Markdown View
        </Button>
        <Button
          variant={viewMode === "structured" ? "default" : "ghost"}
          size="sm"
          onClick={() => setViewMode("structured")}
        >
          Structured View
        </Button>
      </div>

      {viewMode === "markdown" ? (
        <div className="rounded-lg border bg-card p-4">
          <Response>{notebookData.markdown_export || text}</Response>
        </div>
      ) : (
        <NotebookStructuredView data={notebookData} />
      )}
    </div>
  );
}


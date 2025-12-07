"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotebookViewer } from "@/components/notebook-viewer";
import { CalendarDaysIcon, BookOpenIcon, CheckCircle2Icon, AlarmClockIcon, StickyNoteIcon, ArrowLeftIcon, SearchIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

// Color palettes for notebooks
const PALETTE = [
  "bg-yellow-100 border-yellow-300",
  "bg-blue-100 border-blue-300",
  "bg-green-100 border-green-300",
  "bg-purple-100 border-purple-300",
  "bg-pink-100 border-pink-300",
  "bg-orange-100 border-orange-300",
  "bg-indigo-100 border-indigo-300",
];

function getNotebookColor(idx: number) {
  return PALETTE[idx % PALETTE.length];
}

interface Notebook {
  _id: string;
  notebook_name: string;
  created_at: string;
  pages: Array<{
    page_index: number;
    page_metadata: any;
    extracted_items: Array<{
      type: string;
      symbol: string;
      status: string;
      time: string;
      content: string;
      metadata: any;
    }>;
  }>;
  markdown_export: string;
}

// Return local YYYY-MM-DD for a Date or date string (avoids UTC shifts from toISOString)
const formatDateYMD = (input?: string | Date | null): string | null => {
  if (!input) return null;
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function NotesPage() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [filteredNotebooks, setFilteredNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarView, setCalendarView] = useState<'year' | 'month'>('month');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'tasks' | 'events' | 'notes'>('all');

  useEffect(() => {
    fetch("http://localhost:8000/all_notebooks")
      .then(res => res.json())
      .then(data => {
        const notebooks = data.notebooks || [];
        setNotebooks(notebooks);
        setFilteredNotebooks(notebooks);
      })
      .finally(() => setLoading(false));
  }, []);

  // Search and date filtering functionality
  useEffect(() => {
    let filtered = notebooks;

    // Apply search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(notebook => 
        notebook.notebook_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        notebook.pages.some(page => 
          page.extracted_items.some(item => 
            item.content.toLowerCase().includes(searchQuery.toLowerCase())
          )
        )
      );
    }

    // Apply date filter if a date is selected
    if (selectedDate) {
      filtered = filtered.filter(notebook => {
        const notebookDate = formatDateYMD(notebook.created_at);
        return notebookDate === selectedDate;
      });
    }

    setFilteredNotebooks(filtered);
  }, [searchQuery, notebooks, selectedDate]);

  // Generate calendar heatmap data for year view
  const generateYearCalendarData = () => {
    const today = new Date();
    const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    const days = [];
    
    // Create array of all days in the past year
    for (let d = new Date(oneYearAgo); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = formatDateYMD(d);
      const notebooksOnDate = notebooks.filter(nb => formatDateYMD(nb.created_at) === dateStr).length;
      
      // GitHub-style intensity levels (0-4)
      let level = 0;
      if (notebooksOnDate > 0) {
        if (notebooksOnDate >= 4) level = 4;
        else if (notebooksOnDate >= 3) level = 3;
        else if (notebooksOnDate >= 2) level = 2;
        else level = 1;
      }
      
      days.push({
        date: new Date(d),
        count: notebooksOnDate,
        level: level
      });
    }
    
    return days;
  };

  // Generate calendar data for month view
  const generateMonthCalendarData = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday
    
    const days = [];
    const current = new Date(startDate);
    
    // Generate 6 weeks (42 days) to fill the calendar grid
    for (let i = 0; i < 42; i++) {
      const dateStr = formatDateYMD(current);
      const notebooksOnDate = notebooks.filter(nb => formatDateYMD(nb.created_at) === dateStr).length;
      
      // GitHub-style intensity levels (0-4)
      let level = 0;
      if (notebooksOnDate > 0) {
        if (notebooksOnDate >= 4) level = 4;
        else if (notebooksOnDate >= 3) level = 3;
        else if (notebooksOnDate >= 2) level = 2;
        else level = 1;
      }
      
      days.push({
        date: new Date(current),
        count: notebooksOnDate,
        level: level,
        isCurrentMonth: current.getMonth() === month
      });
      
      current.setDate(current.getDate() + 1);
    }
    
    return days;
  };

  const yearCalendarData = generateYearCalendarData();
  const monthCalendarData = generateMonthCalendarData();

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const openNotebook = (notebook: Notebook) => {
    // Navigate to a full-page view instead of modal
    const notebookData = {
      ...notebook,
      markdown_export: generateMarkdownFromPages(notebook)
    };
    
    // Store notebook data in sessionStorage for the full-page view
    sessionStorage.setItem('selectedNotebook', JSON.stringify(notebookData));
    
    // Navigate to full-page notebook view
    window.location.href = `/notes/${notebook._id}`;
  };

  const getNotebookStats = (notebook: Notebook) => {
    const allItems = notebook.pages.flatMap(page => page.extracted_items || []);
    const typeCounts = allItems.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const stats = [];
    if (typeCounts.task) stats.push(`${typeCounts.task} tasks`);
    if (typeCounts.event) stats.push(`${typeCounts.event} events`);
    if (typeCounts.note) stats.push(`${typeCounts.note} notes`);
    
    return stats.join(", ") || "No items";
  };

  // Generate better markdown from pages data
  const generateMarkdownFromPages = (notebook: Notebook): string => {
    let markdown = `# ${notebook.notebook_name}\n\n`;
    
    notebook.pages.forEach(page => {
      // Add page header with date if available
      const dateHeaders = page.page_metadata?.date_headers || [];
      if (dateHeaders.length > 0) {
        markdown += `## ${dateHeaders[0]}\n\n`;
      } else {
        markdown += `## Page ${page.page_index}\n\n`;
      }
      
      // Group items by time for better organization
      const itemsWithTime = page.extracted_items.filter(item => item.time);
      const itemsWithoutTime = page.extracted_items.filter(item => !item.time);
      
      // Sort timed items by time
      itemsWithTime.sort((a, b) => {
        const timeA = a.time || "00:00";
        const timeB = b.time || "00:00";
        return timeA.localeCompare(timeB);
      });
      
      // Add timed items first
      itemsWithTime.forEach(item => {
        const checkbox = getCheckboxForItem(item);
        const timeStr = item.time ? `${item.time} ` : "";
        const symbol = item.symbol !== item.status ? `${item.symbol} ` : "";
        markdown += `- ${checkbox} ${timeStr}${symbol}${item.content}\n`;
      });
      
      // Add non-timed items
      itemsWithoutTime.forEach(item => {
        const checkbox = getCheckboxForItem(item);
        const symbol = item.symbol !== item.status ? `${item.symbol} ` : "";
        markdown += `- ${checkbox} ${symbol}${item.content}\n`;
      });
      
      markdown += "\n";
    });
    
    return markdown;
  };

  // Generate timeline data from notebooks
  const generateTimelineData = () => {
    const timelineItems: Array<{
      id: string;
      type: 'task' | 'event' | 'note';
      title: string;
      time?: string;
      date: string;
      status: string;
      notebookName: string;
      color: string;
    }> = [];

    notebooks.forEach(notebook => {
      notebook.pages.forEach(page => {
        page.extracted_items?.forEach((item, index) => {
          const itemDate = item.metadata?.associated_date || notebook.created_at;
          // Ensure we have a valid date before parsing
          if (!itemDate) return;
          
          const dateObj = new Date(itemDate);
          // Check if the date is valid
          if (isNaN(dateObj.getTime())) return;
          
          const parsedDate = dateObj.toISOString().split('T')[0];
          
          timelineItems.push({
            id: `${notebook._id}-${page.page_index}-${index}`,
            type: item.type as 'task' | 'event' | 'note',
            title: item.content,
            time: item.time || undefined,
            date: parsedDate,
            status: item.status,
            notebookName: notebook.notebook_name,
            color: getTimelineItemColor(item.type, item.status)
          });
        });
      });
    });

    // Sort by date and time
    return timelineItems.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      
      const timeA = a.time || '00:00';
      const timeB = b.time || '00:00';
      return timeA.localeCompare(timeB);
    });
  };

  const getTimelineItemColor = (type: string, status: string) => {
    if (type === 'task') {
      if (status === 'X' || status === 'completed') return '#10b981'; // green
      if (status === '/' || status === 'in_progress') return '#f59e0b'; // amber
      return '#3b82f6'; // blue
    }
    if (type === 'event') return '#8b5cf6'; // purple
    if (type === 'note') return '#6b7280'; // gray
    return '#9ca3af'; // default gray
  };

  const timelineData = generateTimelineData();
  const filteredTimelineData = timelineFilter === 'all' 
    ? timelineData 
    : timelineData.filter(item => {
        if (timelineFilter === 'tasks') return item.type === 'task';
        if (timelineFilter === 'events') return item.type === 'event';
        if (timelineFilter === 'notes') return item.type === 'note';
        return false;
      });

  // Helper function to get appropriate checkbox for item
  const getCheckboxForItem = (item: any): string => {
    // For tasks - use checkboxes
    if (item.type === "task") {
      if (item.status === "completed" || item.status === "X" || item.symbol === "X") return "[x]";
      if (item.status === "in_progress" || item.status === "/" || item.symbol === "/") return "[/]";
      return "[ ]";
    }
    
    // For events - use radio buttons
    if (item.type === "event") {
      if (item.status === "completed" || item.status === "X" || item.symbol === "filled O") return "(●)";
      return "(○)";
    }
    
    // For other types
    if (item.status === "=" || item.symbol === "=") return "[=]";
    if (item.type === "note") return "-";
    
    return "[ ]";
  };

  return (
    <div className="relative h-screen bg-neutral-50 overflow-hidden flex flex-col">
      {/* Header with back button */}
      <header className="flex-shrink-0 z-40 bg-white/90 backdrop-blur border-b shadow-sm">
          <div className="flex items-center gap-4 px-4 py-3">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => window.location.href = '/'}
              className="flex items-center gap-2"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Chat</span>
            </Button>
            
            <div className="flex items-center gap-2 flex-1">
              <BookOpenIcon className="w-5 h-5 text-indigo-600" />
              <h1 className="font-semibold text-lg text-gray-800">All Notes</h1>
            </div>
            
            {/* Mobile calendar toggle button */}
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden flex items-center gap-2"
              onClick={() => {
                const overlay = document.getElementById('mobile-calendar-overlay');
                if (overlay) overlay.classList.remove('hidden');
              }}
            >
              <CalendarDaysIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Calendar</span>
            </Button>
          </div>
      </header>

      {/* Main content with sidebar */}
      <main className="flex-1 flex w-full overflow-hidden">
        {/* Left sidebar with calendar - hidden on mobile, shown as overlay */}
        <aside className="hidden lg:block w-80 p-4 bg-white border-r h-full overflow-y-auto flex-shrink-0">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-gray-700">Activity Calendar</h3>
              <div className="flex gap-1">
                <Button
                  variant={calendarView === 'year' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setCalendarView('year')}
                  className="text-xs px-2 py-1 h-6"
                >
                  Year
                </Button>
                <Button
                  variant={calendarView === 'month' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setCalendarView('month')}
                  className="text-xs px-2 py-1 h-6"
                >
                  Month
                </Button>
              </div>
            </div>
            
            {calendarView === 'year' ? (
              <div className="text-xs text-gray-500 mb-2">
                {notebooks.length} notebooks in the last year
              </div>
            ) : (
              <div className="flex items-center justify-between mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateMonth('prev')}
                  className="p-1 h-6 w-6"
                >
                  <ChevronLeftIcon className="w-3 h-3" />
                </Button>
                <div className="text-xs text-gray-700 font-medium">
                  {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateMonth('next')}
                  className="p-1 h-6 w-6"
                >
                  <ChevronRightIcon className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
          
          {/* Calendar display */}
          <div className="overflow-x-auto">
            {calendarView === 'year' ? (
              /* Year view - GitHub-style heatmap */
              <div className="grid grid-cols-53 gap-1 text-xs">
                {/* Month labels */}
                <div className="col-span-53 grid grid-cols-12 gap-4 mb-2 text-gray-500">
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => (
                    <span key={month} className="text-center">{month}</span>
                  ))}
                </div>
                
                {/* Calendar grid */}
                {yearCalendarData.map((day, idx) => (
                  <div
                    key={idx}
                      className={cn(
                        "w-3 h-3 rounded-sm cursor-pointer hover:ring-1 hover:ring-gray-400 transition-all",
                        day.level === 0 && "bg-gray-100",
                        day.level === 1 && "bg-green-200",
                        day.level === 2 && "bg-green-300",
                        day.level === 3 && "bg-green-400",
                        day.level === 4 && "bg-green-500"
                      )}
                    title={`${day.date.toDateString()}: ${day.count} notebooks`}
                  />
                ))}
              </div>
            ) : (
              /* Month view - Traditional calendar */
              <div className="grid grid-cols-7 gap-1 text-xs">
                {/* Day headers */}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-gray-500 font-medium py-2">
                    {day}
                  </div>
                ))}
                
                {/* Calendar days */}
                {monthCalendarData.map((day, idx) => {
                  const dateStr = formatDateYMD(day.date) || "";
                  const isSelected = selectedDate === dateStr;
                  
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "aspect-square flex items-center justify-center rounded-sm border cursor-pointer hover:border-gray-400 relative transition-all",
                        !day.isCurrentMonth && "text-gray-300",
                        day.isCurrentMonth && "text-gray-700",
                        isSelected && "ring-2 ring-indigo-500 border-indigo-500",
                        !isSelected && "border-gray-200",
                        day.level === 0 && !isSelected && "bg-gray-100",
                        day.level === 1 && !isSelected && "bg-green-200",
                        day.level === 2 && !isSelected && "bg-green-300",
                        day.level === 3 && !isSelected && "bg-green-400",
                        day.level === 4 && !isSelected && "bg-green-500",
                        isSelected && "bg-indigo-100"
                      )}
                      title={`${day.date.toDateString()}: ${day.count} notebooks`}
                      onClick={() => {
                        if (day.isCurrentMonth) {
                          setSelectedDate(selectedDate === dateStr ? null : dateStr);
                        }
                      }}
                    >
                      <span className="text-xs">{day.date.getDate()}</span>
                      {day.count > 0 && !isSelected && (
                        <div className="absolute bottom-0 right-0 w-1 h-1 bg-green-600 rounded-full"></div>
                      )}
                      {isSelected && (
                        <div className="absolute bottom-0 right-0 w-1 h-1 bg-indigo-600 rounded-full"></div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* GitHub-style Legend */}
            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Less</span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-gray-100 rounded-sm border border-gray-200" title="No contributions"></div>
                  <div className="w-3 h-3 bg-green-200 rounded-sm" title="1 notebook"></div>
                  <div className="w-3 h-3 bg-green-300 rounded-sm" title="2 notebooks"></div>
                  <div className="w-3 h-3 bg-green-400 rounded-sm" title="3 notebooks"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-sm" title="4+ notebooks"></div>
                </div>
                <span className="text-gray-500">More</span>
              </div>
            </div>
            
              {/* Timeline Toggle */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm text-gray-700">Timeline View</h4>
                  <button
                    onClick={() => setShowTimeline(!showTimeline)}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      showTimeline ? "bg-indigo-600" : "bg-gray-200"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                        showTimeline ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
            </div>
          </div>
          
        </aside>

        {/* Mobile calendar sidebar overlay */}
        <div className="lg:hidden fixed inset-0 z-50 bg-black bg-opacity-50 hidden" id="mobile-calendar-overlay">
          <div className="w-80 h-full bg-white p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg text-gray-800">Calendar</h3>
              <button 
                onClick={() => {
                  const overlay = document.getElementById('mobile-calendar-overlay');
                  if (overlay) overlay.classList.add('hidden');
                }}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Calendar content for mobile */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-gray-700">Activity Calendar</h3>
                <div className="flex gap-1">
                  <button
                    className={`text-xs px-2 py-1 h-6 rounded ${calendarView === 'year' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'}`}
                    onClick={() => setCalendarView('year')}
                  >
                    Year
                  </button>
                  <button
                    className={`text-xs px-2 py-1 h-6 rounded ${calendarView === 'month' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'}`}
                    onClick={() => setCalendarView('month')}
                  >
                    Month
                  </button>
                </div>
              </div>
              
              {calendarView === 'year' ? (
                <div className="text-xs text-gray-500 mb-2">
                  {notebooks.length} notebooks in the last year
                </div>
              ) : (
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => navigateMonth('prev')}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h4 className="font-medium text-sm">
                    {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </h4>
                  <button
                    onClick={() => navigateMonth('next')}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
              
              {/* Mobile calendar grid */}
              {calendarView === 'month' ? (
                <div className="grid grid-cols-7 gap-1 text-xs">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-gray-500 font-medium py-2">
                      {day}
                    </div>
                  ))}
                  
                  {monthCalendarData.map((day, idx) => {
                    const dateStr = formatDateYMD(day.date) || "";
                    const isSelected = selectedDate === dateStr;
                    
                    return (
                      <div
                        key={idx}
                        className={cn(
                          "aspect-square flex items-center justify-center rounded-sm border cursor-pointer hover:border-gray-400 relative transition-all",
                          !day.isCurrentMonth && "text-gray-300",
                          day.isCurrentMonth && "text-gray-700",
                          isSelected && "ring-2 ring-indigo-500 border-indigo-500",
                          !isSelected && "border-gray-200",
                          day.level === 0 && !isSelected && "bg-gray-100",
                          day.level === 1 && !isSelected && "bg-green-200",
                          day.level === 2 && !isSelected && "bg-green-300",
                          day.level === 3 && !isSelected && "bg-green-400",
                          day.level === 4 && !isSelected && "bg-green-500",
                          isSelected && "bg-indigo-100"
                        )}
                        title={`${day.date.toDateString()}: ${day.count} notebooks`}
                        onClick={() => {
                          if (day.isCurrentMonth) {
                            setSelectedDate(selectedDate === dateStr ? null : dateStr);
                            // Close mobile calendar after selection
                            const overlay = document.getElementById('mobile-calendar-overlay');
                            if (overlay) overlay.classList.add('hidden');
                          }
                        }}
                      >
                        <span className="text-xs">{day.date.getDate()}</span>
                        {day.count > 0 && !isSelected && (
                          <div className="absolute bottom-0 right-0 w-1 h-1 bg-green-600 rounded-full"></div>
                        )}
                        {isSelected && (
                          <div className="absolute bottom-0 right-0 w-1 h-1 bg-indigo-600 rounded-full"></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-1">
                  {yearCalendarData.map((day, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "w-3 h-3 rounded-sm cursor-pointer",
                        day.level === 0 && "bg-gray-100",
                        day.level === 1 && "bg-green-200",
                        day.level === 2 && "bg-green-300",
                        day.level === 3 && "bg-green-400",
                        day.level === 4 && "bg-green-500"
                      )}
                      title={`${day.date.toDateString()}: ${day.count} notebooks`}
                      onClick={() => {
                        const dateStr = formatDateYMD(day.date) || "";
                        setSelectedDate(selectedDate === dateStr ? null : dateStr);
                        // Close mobile calendar after selection
                        const overlay = document.getElementById('mobile-calendar-overlay');
                        if (overlay) overlay.classList.add('hidden');
                      }}
                    />
                  ))}
                </div>
              )}
              
              {/* GitHub-style Legend for Mobile */}
              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Less</span>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 bg-gray-100 rounded-sm border border-gray-200" title="No contributions"></div>
                    <div className="w-2.5 h-2.5 bg-green-200 rounded-sm" title="1 notebook"></div>
                    <div className="w-2.5 h-2.5 bg-green-300 rounded-sm" title="2 notebooks"></div>
                    <div className="w-2.5 h-2.5 bg-green-400 rounded-sm" title="3 notebooks"></div>
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-sm" title="4+ notebooks"></div>
                  </div>
                  <span className="text-gray-500">More</span>
                </div>
              </div>
              
              {/* Mobile Timeline Toggle */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm text-gray-700">Timeline View</h4>
                  <button
                    onClick={() => setShowTimeline(!showTimeline)}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      showTimeline ? "bg-indigo-600" : "bg-gray-200"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                        showTimeline ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right content area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Fixed search bar area */}
          <div className={cn(
            "flex-shrink-0 z-30 px-4 py-3",
            showTimeline ? "bg-white border-b border-gray-100" : ""
          )}>
            {/* ChatGPT-style search bar */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative w-full max-w-md">
                <SearchIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search notebooks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-full border border-gray-200 focus:border-gray-300 focus:ring-0 outline-none transition-all text-gray-700 bg-white shadow-sm hover:shadow-md focus:shadow-md text-sm"
                  style={{ 
                    boxShadow: searchQuery ? '0 4px 12px rgba(0,0,0,0.1)' : '0 2px 8px rgba(0,0,0,0.05)'
                  }}
                />
              </div>
              
              {/* Active filters display */}
              {(selectedDate || searchQuery) && (
                <div className="flex gap-2 flex-wrap">
                  {selectedDate && (
                    <div className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs">
                      <CalendarDaysIcon className="w-3 h-3" />
                      <span>{new Date(selectedDate).toLocaleDateString()}</span>
                      <button
                        onClick={() => setSelectedDate(null)}
                        className="ml-1 hover:bg-indigo-200 rounded-full w-4 h-4 flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {searchQuery && (
                    <div className="flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs">
                      <SearchIcon className="w-3 h-3" />
                      <span>"{searchQuery}"</span>
                      <button
                        onClick={() => setSearchQuery("")}
                        className="ml-1 hover:bg-gray-200 rounded-full w-4 h-4 flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Timeline Header - Fixed */}
          {showTimeline && (
            <div className="flex-shrink-0 z-30 bg-white px-4 py-3 border-b border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Timeline View</h2>
                  <p className="text-sm text-gray-500">
                    {filteredTimelineData.length} items • Filtered by {timelineFilter}
                  </p>
                </div>
                
                {/* Timeline Filters */}
                <div className="hidden sm:flex gap-2">
                  {(['all', 'tasks', 'events', 'notes'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTimelineFilter(filter)}
                      className={cn(
                        "px-3 py-1 text-sm rounded-full border transition-colors",
                        timelineFilter === filter
                          ? "bg-indigo-100 border-indigo-300 text-indigo-700"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            {showTimeline ? (
              /* Timeline Content - Two Pane Layout */
              <div className="h-full flex">
                {/* Left Pane - Timeline List */}
                <div className="flex-1 p-4">
                  {filteredTimelineData.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="text-gray-500 mb-2">No {timelineFilter === 'all' ? 'items' : timelineFilter} found</div>
                        <button
                          onClick={() => setTimelineFilter('all')}
                          className="text-indigo-600 hover:text-indigo-700 text-sm"
                        >
                          Show all items
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {/* Group by date */}
                      {Object.entries(
                        filteredTimelineData.reduce((groups, item) => {
                          const date = item.date;
                          if (!groups[date]) groups[date] = [];
                          groups[date].push(item);
                          return groups;
                        }, {} as Record<string, typeof filteredTimelineData>)
                      ).map(([date, items]) => (
                        <div key={date} className="relative">
                          {/* Date Header */}
                          <div className="sticky top-0 bg-white/95 backdrop-blur-sm py-4 mb-6 border-b border-gray-200 z-10 shadow-sm -mx-4 px-4">
                            <h3 className="text-base font-semibold text-gray-800">
                              {new Date(date).toLocaleDateString('en-US', { 
                                weekday: 'long', 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric' 
                              })}
                            </h3>
                          </div>
                          
                          {/* Timeline Items for this date */}
                          <div className="space-y-3 pl-4 border-l-2 border-gray-200">
                            {items.map((item) => (
                              <div
                                key={item.id}
                                className="relative"
                              >
                                {/* Timeline dot */}
                                <div
                                  className="absolute -left-6 w-4 h-4 rounded-full border-2 border-white"
                                  style={{ backgroundColor: item.color }}
                                />
                                
                                {/* Content Card */}
                                <div className="flex items-start gap-4 p-4 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                                  <div className="flex-1">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <h4 className="text-sm font-medium text-gray-900 mb-1">
                                          {item.title}
                                        </h4>
                                        <div className="flex items-center gap-3 text-xs text-gray-500">
                                          {item.time && (
                                            <span className="flex items-center gap-1">
                                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                              </svg>
                                              {item.time}
                                            </span>
                                          )}
                                          <span className="px-2 py-1 bg-gray-100 rounded-full">
                                            {item.type}
                                          </span>
                                          <span className="text-gray-400">
                                            from {item.notebookName}
                                          </span>
                                        </div>
                                      </div>
                                      
                                      {/* Status indicator */}
                                      <div className="flex items-center gap-2">
                                        {item.status === 'X' && (
                                          <div className="w-5 h-5 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                          </div>
                                        )}
                                        {item.status === '/' && (
                                          <div className="w-5 h-5 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                            </svg>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Pane - Timeline Statistics/Summary */}
                <div className="w-80 border-l border-gray-200 bg-white p-4">
                  <div className="space-y-6">
                    {/* Timeline Summary */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Timeline Summary</h3>
                      
                      {/* Stats Cards */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-blue-50 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">
                            {filteredTimelineData.filter(item => item.type === 'task').length}
                          </div>
                          <div className="text-xs text-blue-600">Tasks</div>
                        </div>
                        <div className="bg-purple-50 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-purple-600">
                            {filteredTimelineData.filter(item => item.type === 'event').length}
                          </div>
                          <div className="text-xs text-purple-600">Events</div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-gray-600">
                            {filteredTimelineData.filter(item => item.type === 'note').length}
                          </div>
                          <div className="text-xs text-gray-600">Notes</div>
                        </div>
                        <div className="bg-green-50 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">
                            {filteredTimelineData.filter(item => item.status === 'X').length}
                          </div>
                          <div className="text-xs text-green-600">Completed</div>
                        </div>
                      </div>
                    </div>

                    {/* Recent Activity */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Recent Activity</h4>
                      <div className="space-y-2">
                        {filteredTimelineData.slice(0, 5).map((item) => (
                          <div key={item.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-md">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-gray-900 truncate">
                                {item.title}
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(item.date).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Filter Quick Actions */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Quick Filters</h4>
                      <div className="space-y-2">
                        <button
                          onClick={() => setTimelineFilter('tasks')}
                          className="w-full text-left p-2 text-xs bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
                        >
                          View All Tasks ({filteredTimelineData.filter(item => item.type === 'task').length})
                        </button>
                        <button
                          onClick={() => setTimelineFilter('events')}
                          className="w-full text-left p-2 text-xs bg-purple-50 text-purple-700 rounded-md hover:bg-purple-100 transition-colors"
                        >
                          View All Events ({filteredTimelineData.filter(item => item.type === 'event').length})
                        </button>
                        <button
                          onClick={() => setTimelineFilter('notes')}
                          className="w-full text-left p-2 text-xs bg-gray-50 text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          View All Notes ({filteredTimelineData.filter(item => item.type === 'note').length})
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 pt-2">
                {loading && (
            <div className="[column-count:1] sm:[column-count:2] lg:[column-count:3] [column-gap:1rem]">
              {/* Generate shimmer cards */}
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="mb-4 rounded-xl border shadow break-inside-avoid p-4 min-h-[120px] relative bg-gray-100 animate-pulse"
                  style={{ boxShadow: "0 4px 16px 4px rgba(100,100,140,0.07)", maxWidth: 370 }}
                >
                  <div className="flex items-start gap-2 mb-3">
                    <div className="w-5 h-5 bg-gray-200 rounded animate-pulse mt-0.5 flex-shrink-0"></div>
                    <div className="w-3/4 h-5 bg-gray-200 rounded animate-pulse flex-1"></div>
                  </div>
                  
                  <div className="w-2/3 h-4 bg-gray-200 rounded animate-pulse mb-3"></div>
                  
                  <div className="flex items-center justify-between">
                    <div className="w-16 h-3 bg-gray-200 rounded animate-pulse"></div>
                    <div className="w-20 h-3 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {!loading && filteredNotebooks.length === 0 && (
            <div className="flex flex-col items-center justify-center my-16 px-4">
              {/* Illustration */}
              <div className="mb-8 relative">
                <svg
                  width="200"
                  height="200"
                  viewBox="0 0 400 400"
                  className="drop-shadow-lg"
                >
                  {/* Background circle */}
                  <circle cx="200" cy="200" r="180" fill="#1a1a1a" opacity="0.9" />
                  
                  {/* Person */}
                  <g transform="translate(200, 200)">
                    {/* Head */}
                    <ellipse cx="0" cy="-40" rx="25" ry="30" fill="#f4a261" />
                    
                    {/* Hair */}
                    <path d="M -25 -65 Q 0 -75 25 -65 Q 20 -45 0 -50 Q -20 -45 -25 -65" fill="#8b4513" />
                    
                    {/* Eyes (stressed) */}
                    <circle cx="-8" cy="-45" r="2" fill="#333" />
                    <circle cx="8" cy="-45" r="2" fill="#333" />
                    <path d="M -12 -50 L -4 -48" stroke="#333" strokeWidth="1.5" fill="none" />
                    <path d="M 4 -48 L 12 -50" stroke="#333" strokeWidth="1.5" fill="none" />
                    
                    {/* Mouth (frown) */}
                    <path d="M -8 -30 Q 0 -25 8 -30" stroke="#333" strokeWidth="2" fill="none" />
                    
                    {/* Body */}
                    <rect x="-30" y="-10" width="60" height="80" rx="15" fill="#e76f51" />
                    
                    {/* Arms (hands on head) */}
                    <ellipse cx="-45" cy="10" rx="12" ry="35" fill="#e76f51" transform="rotate(-30)" />
                    <ellipse cx="45" cy="10" rx="12" ry="35" fill="#e76f51" transform="rotate(30)" />
                    
                    {/* Hands */}
                    <circle cx="-35" cy="-25" r="8" fill="#f4a261" />
                    <circle cx="35" cy="-25" r="8" fill="#f4a261" />
                    
                    {/* Legs */}
                    <rect x="-20" y="70" width="15" height="50" fill="#264653" />
                    <rect x="5" y="70" width="15" height="50" fill="#264653" />
                    
                    {/* Feet */}
                    <ellipse cx="-12" cy="125" rx="12" ry="6" fill="#2a9d8f" />
                    <ellipse cx="12" cy="125" rx="12" ry="6" fill="#2a9d8f" />
                  </g>
                  
                  {/* Stress elements around person */}
                  {/* Lightning bolts */}
                  <path d="M 120 80 L 110 100 L 120 95 L 105 120" stroke="#f4a261" strokeWidth="3" fill="none" />
                  <path d="M 280 80 L 290 100 L 280 95 L 295 120" stroke="#f4a261" strokeWidth="3" fill="none" />
                  
                  {/* Papers flying */}
                  <g transform="translate(320, 60) rotate(15)">
                    <rect width="25" height="30" fill="white" rx="2" />
                    <line x1="3" y1="5" x2="22" y2="5" stroke="#333" strokeWidth="1" />
                    <line x1="3" y1="10" x2="18" y2="10" stroke="#333" strokeWidth="1" />
                    <line x1="3" y1="15" x2="20" y2="15" stroke="#333" strokeWidth="1" />
                  </g>
                  
                  <g transform="translate(60, 100) rotate(-20)">
                    <rect width="25" height="30" fill="white" rx="2" />
                    <line x1="3" y1="5" x2="22" y2="5" stroke="#333" strokeWidth="1" />
                    <line x1="3" y1="10" x2="18" y2="10" stroke="#333" strokeWidth="1" />
                  </g>
                  
                  {/* Clock */}
                  <g transform="translate(320, 180)">
                    <circle r="25" fill="#6c5ce7" />
                    <circle r="20" fill="#a29bfe" />
                    <line x1="0" y1="0" x2="0" y2="-12" stroke="white" strokeWidth="2" />
                    <line x1="0" y1="0" x2="8" y2="-8" stroke="white" strokeWidth="1.5" />
                    {/* Clock marks */}
                    <circle cx="0" cy="-15" r="1" fill="white" />
                    <circle cx="15" cy="0" r="1" fill="white" />
                    <circle cx="0" cy="15" r="1" fill="white" />
                    <circle cx="-15" cy="0" r="1" fill="white" />
                  </g>
                  
                  {/* Laptop with low battery */}
                  <g transform="translate(80, 280)">
                    <rect width="50" height="30" fill="#6c5ce7" rx="3" />
                    <rect x="5" y="5" width="40" height="20" fill="#2d3436" rx="2" />
                    {/* Battery icon */}
                    <rect x="15" y="10" width="12" height="6" fill="#e17055" rx="1" />
                    <rect x="16" y="11" width="4" height="4" fill="#d63031" />
                    <text x="30" y="15" fill="#e17055" fontSize="6">!</text>
                  </g>
                  
                  {/* Email with notification */}
                  <g transform="translate(300, 280)">
                    <rect width="35" height="25" fill="#6c5ce7" rx="3" />
                    <path d="M 5 8 L 17.5 15 L 30 8" stroke="white" strokeWidth="1.5" fill="none" />
                    <circle cx="30" cy="5" r="6" fill="#e17055" />
                    <text x="30" y="8" fill="white" fontSize="8" textAnchor="middle">!</text>
                  </g>
                  
                  {/* Hourglass */}
                  <g transform="translate(320, 320)">
                    <path d="M 5 0 L 25 0 L 20 10 L 15 15 L 20 20 L 25 30 L 5 30 L 10 20 L 15 15 L 10 10 Z" fill="#6c5ce7" />
                    <rect x="5" y="0" width="20" height="3" fill="#e17055" />
                    <rect x="5" y="27" width="20" height="3" fill="#e17055" />
                    <path d="M 10 20 L 15 15 L 20 20 L 18 22 L 15 19 L 12 22 Z" fill="#2ecc71" />
                  </g>
                  
                  {/* Plant (desk decoration) */}
                  <g transform="translate(80, 320)">
                    <rect x="10" y="20" width="15" height="15" fill="#6c5ce7" rx="2" />
                    <path d="M 17.5 20 Q 12 10 8 15 Q 15 12 17.5 20" fill="#2ecc71" />
                    <path d="M 17.5 20 Q 20 8 25 12 Q 20 10 17.5 20" fill="#2ecc71" />
                    <path d="M 17.5 20 Q 17 5 22 8 Q 18 8 17.5 20" fill="#2ecc71" />
                  </g>
                </svg>
              </div>
              
              {/* Message */}
              <div className="text-center max-w-md">
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  No notebooks found
                </h3>
                <p className="text-gray-500 mb-4">
                  {searchQuery && selectedDate 
                    ? `No notebooks match "${searchQuery}" on ${new Date(selectedDate).toLocaleDateString()}`
                    : searchQuery 
                    ? `No notebooks match "${searchQuery}"`
                    : selectedDate
                    ? `No notebooks were created on ${new Date(selectedDate).toLocaleDateString()}`
                    : "You haven't created any notebooks yet. Start by uploading your bullet journal images in the chat!"}
                </p>
                
                {(searchQuery || selectedDate) && (
                  <Button
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedDate(null);
                    }}
                    variant="outline"
                    className="mt-2"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </div>
            )}
            
            {!loading && filteredNotebooks.length > 0 && (
              <div className="[column-count:1] sm:[column-count:2] lg:[column-count:3] xl:[column-count:4] [column-gap:0.75rem] sm:[column-gap:1rem]">
                {filteredNotebooks.map((notebook, idx) => (
                  <div
                    key={notebook._id}
                    className={cn(
                      getNotebookColor(idx),
                      "mb-3 sm:mb-4 rounded-xl border shadow sticky-note transform hover:-translate-y-1 hover:shadow-lg transition-all break-inside-avoid p-3 sm:p-4 cursor-pointer min-h-[100px] sm:min-h-[120px] relative"
                    )}
                    style={{ boxShadow: "0 4px 16px 4px rgba(100,100,140,0.07)", maxWidth: 370 }}
                    onClick={() => openNotebook(notebook)}
                  >
                    <div className="flex items-start gap-2 mb-2 sm:mb-3">
                      <BookOpenIcon className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                      <div className="font-semibold text-sm sm:text-base leading-tight text-gray-800 flex-1">
                        {notebook.notebook_name}
                      </div>
                    </div>
                    
                    <div className="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3">
                      {getNotebookStats(notebook)}
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{notebook.pages?.length || 0} pages</span>
                      <span className="text-xs">{new Date(notebook.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
              </div>
            )}
          </div>
        </div>
      </main>

    </div>
  );
}

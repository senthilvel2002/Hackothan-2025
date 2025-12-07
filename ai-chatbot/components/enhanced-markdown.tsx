"use client";

import { memo, useMemo } from "react";
import { Response } from "./elements/response";
import { cn } from "@/lib/utils";
import { Check, Minus } from "lucide-react";

interface EnhancedMarkdownProps {
  children: string;
  className?: string;
}

// Custom components for checkboxes and radio buttons
const TaskCheckbox = ({ checked, inProgress }: { checked: boolean; inProgress?: boolean }) => (
  <span className={cn(
    "inline-flex items-center justify-center w-4 h-4 mr-2 border-2 rounded transition-colors",
    checked ? "bg-green-100 border-green-500" : 
    inProgress ? "bg-yellow-100 border-yellow-500" : 
    "border-gray-300 hover:border-gray-400"
  )}>
    {checked ? (
      <Check className="w-3 h-3 text-green-600" />
    ) : inProgress ? (
      <Minus className="w-3 h-3 text-yellow-600" />
    ) : null}
  </span>
);

const EventRadio = ({ checked }: { checked: boolean }) => (
  <span className={cn(
    "inline-flex items-center justify-center w-4 h-4 mr-2 border-2 rounded-full transition-colors",
    checked ? "bg-green-100 border-green-500" : "border-gray-300 hover:border-gray-400"
  )}>
    {checked && <div className="w-2 h-2 bg-green-600 rounded-full" />}
  </span>
);

const EmotionIndicator = () => (
  <span className="inline-flex items-center justify-center w-4 h-4 mr-2 text-xs bg-purple-100 text-purple-600 rounded border-2 border-purple-300 font-semibold">
    =
  </span>
);

export const EnhancedMarkdown = memo(({ children, className }: EnhancedMarkdownProps) => {
  const processedMarkdown = useMemo(() => {
    // Process the markdown to replace checkbox and radio button patterns with custom components
    let processed = children;
    
    // Replace task checkboxes with placeholder markers that we can process later
    processed = processed.replace(/- \[x\]/g, '- ✅CHECKED✅');
    processed = processed.replace(/- \[\/\]/g, '- 🟡PROGRESS🟡');
    processed = processed.replace(/- \[ \]/g, '- ⬜UNCHECKED⬜');
    
    // Replace event radio buttons
    processed = processed.replace(/- \(●\)/g, '- 🔘RADIOCHECKED🔘');
    processed = processed.replace(/- \(○\)/g, '- ⚪RADIOUNCHECKED⚪');
    
    // Replace emotion indicators
    processed = processed.replace(/- \[=\]/g, '- 💜EMOTION💜');
    
    return processed;
  }, [children]);

  const renderProcessedContent = useMemo(() => {
    // Split into lines and process each one
    const lines = processedMarkdown.split('\n');
    
    return lines.map((line, index) => {
      // Handle headers
      if (line.startsWith('#')) {
        const level = line.match(/^#+/)?.[0].length || 1;
        const text = line.replace(/^#+\s*/, '');
        const HeaderTag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
        
        return (
          <HeaderTag key={index} className={cn(
            "font-bold mb-2 mt-4",
            level === 1 && "text-2xl",
            level === 2 && "text-xl",
            level === 3 && "text-lg",
            level >= 4 && "text-base"
          )}>
            {text}
          </HeaderTag>
        );
      }
      
      // Handle list items with custom checkboxes/radios
      if (line.includes('✅CHECKED✅')) {
        const content = line.replace(/- ✅CHECKED✅\s*/, '').trim();
        return (
          <div key={index} className="flex items-start mb-1 ml-4">
            <TaskCheckbox checked={true} />
            <span className="flex-1">{content}</span>
          </div>
        );
      }
      
      if (line.includes('🟡PROGRESS🟡')) {
        const content = line.replace(/- 🟡PROGRESS🟡\s*/, '').trim();
        return (
          <div key={index} className="flex items-start mb-1 ml-4">
            <TaskCheckbox checked={false} inProgress={true} />
            <span className="flex-1">{content}</span>
          </div>
        );
      }
      
      if (line.includes('⬜UNCHECKED⬜')) {
        const content = line.replace(/- ⬜UNCHECKED⬜\s*/, '').trim();
        return (
          <div key={index} className="flex items-start mb-1 ml-4">
            <TaskCheckbox checked={false} />
            <span className="flex-1">{content}</span>
          </div>
        );
      }
      
      if (line.includes('🔘RADIOCHECKED🔘')) {
        const content = line.replace(/- 🔘RADIOCHECKED🔘\s*/, '').trim();
        return (
          <div key={index} className="flex items-start mb-1 ml-4">
            <EventRadio checked={true} />
            <span className="flex-1">{content}</span>
          </div>
        );
      }
      
      if (line.includes('⚪RADIOUNCHECKED⚪')) {
        const content = line.replace(/- ⚪RADIOUNCHECKED⚪\s*/, '').trim();
        return (
          <div key={index} className="flex items-start mb-1 ml-4">
            <EventRadio checked={false} />
            <span className="flex-1">{content}</span>
          </div>
        );
      }
      
      if (line.includes('💜EMOTION💜')) {
        const content = line.replace(/- 💜EMOTION💜\s*/, '').trim();
        return (
          <div key={index} className="flex items-start mb-1 ml-4">
            <EmotionIndicator />
            <span className="flex-1">{content}</span>
          </div>
        );
      }
      
      // Handle regular list items
      if (line.startsWith('- ')) {
        const content = line.replace(/^- /, '');
        return (
          <div key={index} className="flex items-start mb-1 ml-4">
            <span className="mr-2">•</span>
            <span className="flex-1">{content}</span>
          </div>
        );
      }
      
      // Handle regular paragraphs
      if (line.trim()) {
        return (
          <p key={index} className="mb-2">
            {line}
          </p>
        );
      }
      
      // Empty lines
      return <div key={index} className="mb-2" />;
    });
  }, [processedMarkdown]);

  return (
    <div className={cn("prose prose-sm max-w-none", className)}>
      {renderProcessedContent}
    </div>
  );
});

EnhancedMarkdown.displayName = "EnhancedMarkdown";
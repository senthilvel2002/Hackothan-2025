"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo } from "react";
import { useWindowSize } from "usehooks-ts";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "./icons";
import { useSidebar } from "./ui/sidebar";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";
import { CalendarDaysIcon } from "lucide-react";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const router = useRouter();
  const { open } = useSidebar();

  const { width: windowWidth } = useWindowSize();

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2 border-b">
      <SidebarToggle />

      <div className="flex items-center gap-2 flex-1">
        {(!open || windowWidth < 768) && (
          <span className="font-semibold text-base md:text-lg">Bujo GPT</span>
        )}
        {/* All Notes Button */}
        <Button
          className="ml-2 h-8 px-2 md:h-fit md:px-2 font-semibold text-indigo-700 border-indigo-300 bg-indigo-50 hover:bg-indigo-100 flex items-center gap-2 transition-all shadow-sm"
          onClick={() => router.push("/notes")}
          variant="outline"
        >
          <CalendarDaysIcon className="w-5 h-5" />
          <span className="hidden md:inline">All Notes</span>
        </Button>
        {(!open || windowWidth < 768) && (
          <Button
            className="ml-auto h-8 px-2 md:h-fit md:px-2"
            onClick={() => {
              router.push("/");
              router.refresh();
            }}
            variant="outline"
          >
            <PlusIcon />
            <span className="md:sr-only">New Chat</span>
          </Button>
        )}
      </div>

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          className="order-1 md:order-2"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});

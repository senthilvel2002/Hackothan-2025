import Image from "next/image";
import type { Attachment } from "@/lib/types";
import { Loader } from "./elements/loader";
import { CrossSmallIcon, FileIcon, ImageIcon } from "./icons";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const getFileIcon = (contentType?: string, name?: string) => {
  if (contentType?.startsWith("image")) {
    return <ImageIcon size={24} className="text-muted-foreground" />;
  }
  
  // Check file extension for better icon selection
  const extension = name?.split(".").pop()?.toLowerCase();
  
  if (extension === "pdf" || contentType?.includes("pdf")) {
    return <FileIcon size={24} className="text-red-500" />;
  }
  
  if (["doc", "docx"].includes(extension || "") || contentType?.includes("word")) {
    return <FileIcon size={24} className="text-blue-500" />;
  }
  
  if (["xls", "xlsx"].includes(extension || "") || contentType?.includes("excel") || contentType?.includes("spreadsheet")) {
    return <FileIcon size={24} className="text-green-500" />;
  }
  
  if (["txt", "rtf"].includes(extension || "") || contentType?.includes("text")) {
    return <FileIcon size={24} className="text-muted-foreground" />;
  }
  
  return <FileIcon size={24} className="text-muted-foreground" />;
};

const getFileTypeLabel = (contentType?: string, name?: string) => {
  if (contentType?.startsWith("image")) {
    return "Image";
  }
  
  const extension = name?.split(".").pop()?.toUpperCase();
  
  if (extension) {
    return extension;
  }
  
  if (contentType) {
    const type = contentType.split("/")[1]?.split(";")[0];
    return type ? type.toUpperCase() : "FILE";
  }
  
  return "FILE";
};

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
  onClick,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}) => {
  const { name, url, contentType } = attachment;
  const isImage = contentType?.startsWith("image");

  const handleClick = () => {
    if (isUploading || !url) return;
    
    if (onClick) {
      onClick();
    } else {
      // Default behavior: open file in new tab
      window.open(url, "_blank");
    }
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted",
        isImage ? "size-16" : "w-32 h-20",
        !isUploading && url && "cursor-pointer transition-all hover:scale-105 hover:shadow-md"
      )}
      data-testid="input-attachment-preview"
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      role={!isUploading && url ? "button" : undefined}
      tabIndex={!isUploading && url ? 0 : undefined}
    >
      {isImage ? (
        <Image
          alt={name ?? "An image attachment"}
          className="size-full object-cover"
          height={64}
          src={url}
          width={64}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 p-2">
          {getFileIcon(contentType, name)}
          <span className="text-[10px] font-medium text-muted-foreground">
            {getFileTypeLabel(contentType, name)}
          </span>
        </div>
      )}

      {isUploading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50"
          data-testid="input-attachment-loader"
        >
          <Loader size={16} />
        </div>
      )}

      {onRemove && !isUploading && (
        <Button
          className="absolute top-0.5 right-0.5 size-5 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100 z-10"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          size="sm"
          variant="destructive"
        >
          <CrossSmallIcon size={10} />
        </Button>
      )}

      <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 via-black/60 to-transparent px-1.5 py-1 text-[10px] font-medium text-white">
        {name}
      </div>
    </div>
  );
};

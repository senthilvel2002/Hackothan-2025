"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { CameraIcon, CrossIcon } from "./icons";

type CameraCaptureProps = {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
};

export function CameraCapture({
  open,
  onClose,
  onCapture,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsStreaming(true);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to access camera. Please check permissions."
      );
      setIsStreaming(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  const capturePhoto = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
          if (blob) {
            const imageUrl = URL.createObjectURL(blob);
            setCapturedImage(imageUrl);
            stopCamera();
          }
        }, "image/jpeg");
      }
    }
  }, [stopCamera]);

  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
    startCamera();
  }, [startCamera]);

  const usePhoto = useCallback(() => {
    if (capturedImage && canvasRef.current) {
      canvasRef.current.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `photo-${Date.now()}.jpg`, {
            type: "image/jpeg",
          });
          onCapture(file);
          setCapturedImage(null);
          onClose();
        }
      }, "image/jpeg");
    }
  }, [capturedImage, onCapture, onClose]);

  useEffect(() => {
    if (open) {
      startCamera();
    } else {
      stopCamera();
      setCapturedImage(null);
      setError(null);
    }

    return () => {
      stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  return (
    <Dialog onOpenChange={(isOpen) => !isOpen && onClose()} open={open}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>Take Photo</DialogTitle>
        </DialogHeader>

        <div className="relative bg-black">
          {error ? (
            <div className="flex h-64 items-center justify-center p-4 text-center text-sm text-destructive">
              {error}
            </div>
          ) : capturedImage ? (
            <div className="relative">
              <img
                alt="Captured"
                className="h-auto w-full"
                src={capturedImage}
              />
              <div className="absolute right-2 top-2">
                <Button
                  onClick={retakePhoto}
                  size="sm"
                  variant="secondary"
                >
                  <CrossIcon size={16} className="mr-1" />
                  Retake
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <video
                autoPlay
                className="h-auto w-full"
                muted
                playsInline
                ref={videoRef}
              />
              {isStreaming && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                  <Button
                    className="h-16 w-16 rounded-full border-4 border-white bg-white/20 backdrop-blur-sm"
                    onClick={capturePhoto}
                    size="lg"
                    type="button"
                  >
                    <CameraIcon size={24} />
                  </Button>
                </div>
              )}
            </div>
          )}
          <canvas className="hidden" ref={canvasRef} />
        </div>

        {capturedImage && (
          <div className="flex justify-end gap-2 p-4">
            <Button onClick={retakePhoto} variant="outline">
              Retake
            </Button>
            <Button onClick={usePhoto}>Use Photo</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


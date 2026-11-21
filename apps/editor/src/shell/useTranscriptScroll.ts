import { useLayoutEffect, useRef, useState, type WheelEvent } from "react";

/**
 * Transcript viewport: follows new output at the bottom until the reader scrolls away or opens details.
 * `content` is what the transcript shows; it is compared by value because unchanged polls arrive as new objects.
 */
export function useTranscriptScroll({ open, historyOpen, conversationId, content }: {
  open: boolean; historyOpen: boolean; conversationId: string | undefined; content: unknown;
}) {
  const transcript = useRef<HTMLDivElement>(null);
  const transcriptContent = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [away, setAway] = useState(false), [unread, setUnread] = useState(false);
  const jumpToBottom = () => {
    following.current = true; setAway(false); setUnread(false);
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  };
  const readPosition = () => {
    const element = transcript.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 2;
    following.current = atBottom; setAway(!atBottom);
    if (atBottom) setUnread(false);
  };
  const holdDisclosure = () => {
    // A reader opening details owns the viewport, including when previously following.
    following.current = false;
    requestAnimationFrame(readPosition);
  };
  /** Content that grows after its commit (Markdown, math) keeps the bottom only while following. */
  const followLayout = () => { if (following.current) jumpToBottom(); };
  const releaseOnWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0 && event.currentTarget.scrollTop > 0) following.current = false;
  };
  const readingScope = `${conversationId ?? ""}:${historyOpen}`;
  useLayoutEffect(() => {
    if (historyOpen && transcript.current) transcript.current.scrollTop = 0;
    else jumpToBottom();
  }, [readingScope]);
  // Compare visible content, not snapshot identity: unchanged polls are not new output.
  const transcriptRevision = JSON.stringify(content);
  useLayoutEffect(() => {
    if (historyOpen) return;
    if (following.current) jumpToBottom();
    else setUnread(true);
  }, [transcriptRevision]);
  useLayoutEffect(() => {
    if (!open || historyOpen) return;
    // Markdown/math and viewport resizing can change height after the snapshot commit.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(followLayout);
    });
    if (transcript.current) observer.observe(transcript.current);
    if (transcriptContent.current) observer.observe(transcriptContent.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [open, historyOpen]);
  return { transcript, transcriptContent, away, unread, jumpToBottom, readPosition, holdDisclosure, followLayout, releaseOnWheel };
}

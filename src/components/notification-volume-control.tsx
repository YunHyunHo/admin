"use client";

import { useNotificationSoundVolume } from "@/lib/notification-sound-volume";

type NotificationVolumeControlProps = {
  compact?: boolean;
};

export function NotificationVolumeControl({
  compact = false,
}: NotificationVolumeControlProps) {
  const { volume, updateVolume } = useNotificationSoundVolume();
  const percentage = Math.round(volume * 100);

  return (
    <label
      className={`flex items-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/72 ${
        compact ? "h-10 gap-2 px-3" : "h-11 gap-3 px-3"
      }`}
      title="충전신청, 도메인환전, 총판환전 알림음 볼륨"
    >
      <span className="shrink-0 text-xs font-semibold">볼륨</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={percentage}
        onChange={(event) => updateVolume(Number(event.target.value) / 100)}
        aria-label="알림음 볼륨"
        aria-valuetext={`${percentage}%`}
        className={`${compact ? "w-20" : "w-24"} accent-cyan-400`}
      />
      <span className="w-9 text-right text-xs tabular-nums text-white/56">
        {percentage}%
      </span>
    </label>
  );
}

"use client";

import { CalendarClock, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Switch } from "@/components/ui/switch";

export type AgentScheduleItem = {
  id: string;
  agentId: string;
  pageId: string;
  prompt: string;
  frequency: "daily" | "weekly";
  weekday: number | null;
  localHour: number;
  localMinute: number;
  timeZone: string;
  enabled: boolean;
  nextRunAt: string | null;
};

export type AgentScheduleEntry = {
  schedule: AgentScheduleItem;
  agentName: string;
  pageTitle: string;
};

export type AgentOption = { id: string; name: string };
export type PageOption = { id: string; title: string };

export type AgentScheduleListProps = {
  schedules: AgentScheduleEntry[];
  agents: AgentOption[];
  pages: PageOption[];
  onToggleSchedule: (entry: AgentScheduleEntry, enabled: boolean) => void;
  onOpenNewSchedule: () => void;
  onEditSchedule: (entry: AgentScheduleEntry) => void;
};

const weekdayLabels = [
  "Chủ nhật",
  "Thứ hai",
  "Thứ ba",
  "Thứ tư",
  "Thứ năm",
  "Thứ sáu",
  "Thứ bảy",
];

function timeValue(
  schedule: Pick<AgentScheduleItem, "localHour" | "localMinute">
) {
  return `${String(schedule.localHour).padStart(2, "0")}:${String(
    schedule.localMinute
  ).padStart(2, "0")}`;
}

export function AgentScheduleList({
  schedules,
  agents,
  onToggleSchedule,
  onOpenNewSchedule,
  onEditSchedule,
}: AgentScheduleListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lịch Agent</CardTitle>
        <CardDescription>
          Chạy Agent nền theo giờ địa phương; mọi thay đổi Page vẫn cần phê
          duyệt.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenNewSchedule}
            disabled={agents.length === 0}
          >
            <Plus data-icon="inline-start" />
            Thêm lịch
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {schedules.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarClock />
              </EmptyMedia>
              <EmptyTitle>Chưa có lịch Agent</EmptyTitle>
              <EmptyDescription>
                Tạo một Agent trước, rồi lên lịch cho Page cần theo dõi.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          schedules.map((entry) => (
            <Card key={entry.schedule.id} size="sm">
              <CardHeader>
                <CardTitle>
                  {entry.agentName} · {entry.pageTitle}
                </CardTitle>
                <CardDescription>{entry.schedule.prompt}</CardDescription>
                <CardAction>
                  <Switch
                    aria-label={`Bật lịch ${entry.agentName}`}
                    checked={entry.schedule.enabled}
                    onCheckedChange={(enabled) =>
                      onToggleSchedule(entry, enabled)
                    }
                  />
                </CardAction>
              </CardHeader>
              <CardFooter className="gap-2">
                <Badge variant="secondary">
                  {entry.schedule.frequency === "daily"
                    ? "Hàng ngày"
                    : weekdayLabels[entry.schedule.weekday ?? 0]}
                  {" · "}
                  {timeValue(entry.schedule)} {entry.schedule.timeZone}
                </Badge>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => onEditSchedule(entry)}
                >
                  Sửa
                </Button>
              </CardFooter>
            </Card>
          ))
        )}
      </CardContent>
    </Card>
  );
}

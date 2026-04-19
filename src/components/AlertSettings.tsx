import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AlertConfig } from "@/hooks/useAlerts";

interface Props {
  config: AlertConfig;
  update: (p: Partial<AlertConfig>) => void;
  activeCount: number;
}

export const AlertSettings = ({ config, update, activeCount }: Props) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm" className="relative gap-2 rounded-full">
        {config.enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        Alerts
        {activeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {activeCount}
          </span>
        )}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-72 rounded-2xl">
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold">Vital alerts</h3>
          <p className="text-xs text-muted-foreground">Notify when readings exceed limits.</p>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="enabled" className="cursor-pointer">Enabled</Label>
          <Switch id="enabled" checked={config.enabled} onCheckedChange={(v) => update({ enabled: v })} />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="sound" className="flex cursor-pointer items-center gap-2">
            {config.sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            Beep on alert
          </Label>
          <Switch id="sound" checked={config.sound} onCheckedChange={(v) => update({ sound: v })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">HR min</Label>
            <Input
              type="number"
              value={config.hrMin}
              onChange={(e) => update({ hrMin: Number(e.target.value) || 0 })}
              className="h-9 font-mono-tabular"
            />
          </div>
          <div>
            <Label className="text-xs">HR max</Label>
            <Input
              type="number"
              value={config.hrMax}
              onChange={(e) => update({ hrMax: Number(e.target.value) || 0 })}
              className="h-9 font-mono-tabular"
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">SpO₂ min (%)</Label>
            <Input
              type="number"
              value={config.spo2Min}
              onChange={(e) => update({ spo2Min: Number(e.target.value) || 0 })}
              className="h-9 font-mono-tabular"
            />
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
);

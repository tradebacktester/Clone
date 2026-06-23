import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  trend?: number;
  trendLabel?: string;
  className?: string;
  valueClassName?: string;
}

export function MetricCard({
  title,
  value,
  description,
  icon,
  trend,
  trendLabel,
  className,
  valueClassName,
}: MetricCardProps) {
  return (
    <Card className={cn("bg-card border-card-border overflow-hidden relative", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b border-border/10 bg-muted/20">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-medium">
          {title}
        </CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent className="pt-4">
        <div className={cn("text-2xl font-bold font-mono tracking-tight", valueClassName)}>
          {value}
        </div>
        {(description || trend !== undefined) && (
          <div className="flex items-center mt-1 space-x-2 text-xs">
            {trend !== undefined && (
              <span
                className={cn(
                  "font-mono font-medium",
                  trend > 0 ? "text-success" : trend < 0 ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {trend > 0 ? "+" : ""}
                {trend}%
              </span>
            )}
            {description && <span className="text-muted-foreground">{description}</span>}
            {trendLabel && <span className="text-muted-foreground">{trendLabel}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

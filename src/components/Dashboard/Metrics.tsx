import { useSupabaseSession } from '@/services/supabase/auth';
import { getUserStats } from '@/services/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, FileCheck, FileX, RefreshCcw } from 'lucide-react';

export default function Metrics() {
  const { session } = useSupabaseSession();
  const userId = session?.user?.id;
  
  // Query to fetch user stats
  const {
    data: userStats,
    isLoading,
    refetch,
    error
  } = useQuery({
    queryKey: ['userStats', userId],
    queryFn: async () => {
      if (!userId) return null;
      const stats = await getUserStats(userId);
      return stats;
    },
    enabled: !!userId,
  });

  // If we encounter an error, return a message
  if (error) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="col-span-full">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-red-500">Error Loading Stats</CardTitle>
            <RefreshCcw
              className="h-4 w-4 text-muted-foreground cursor-pointer"
              onClick={() => refetch()}
            />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Unable to load your usage statistics. Please try again.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // While loading, show skeletons
  if (isLoading || !userStats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Extract values from user stats with fallbacks
  const totalScanned = userStats?.total_processed_items || 0;
  const successfulScanned = userStats?.successful_processed_items || 0;
  const failedScanned = totalScanned - successfulScanned;
  const lastScannedDate = userStats?.last_processed_at 
    ? new Date(userStats.last_processed_at).toLocaleDateString() 
    : 'Never';

  // Metrics to display
  const metrics = [
    {
      title: 'Total Processed',
      value: totalScanned,
      description: 'Total emails processed',
      icon: <BarChart3 className="h-4 w-4 text-muted-foreground" />,
    },
    {
      title: 'Successfully Processed',
      value: successfulScanned,
      description: 'Bills successfully extracted',
      icon: <FileCheck className="h-4 w-4 text-green-500" />,
    },
    {
      title: 'Failed to Process',
      value: failedScanned,
      description: 'Bills that could not be extracted',
      icon: <FileX className="h-4 w-4 text-red-500" />,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <Card key={metric.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {metric.title}
            </CardTitle>
            {metric.icon}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metric.value}</div>
            <p className="text-xs text-muted-foreground">
              {metric.description}
            </p>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            Last Scan
          </CardTitle>
          <RefreshCcw 
            className="h-4 w-4 text-muted-foreground cursor-pointer" 
            onClick={() => refetch()}
          />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{lastScannedDate}</div>
          <p className="text-xs text-muted-foreground">
            Last time you processed emails
          </p>
        </CardContent>
      </Card>
    </div>
  );
} 
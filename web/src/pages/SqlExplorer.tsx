import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Database, Play, Table } from 'lucide-react';

export function SqlExplorer() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">SQL Explorer</h1>
        <p className="text-muted-foreground mt-2">
          Execute SQL queries against your data.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Query Editor
          </CardTitle>
          <CardDescription>
            Write and execute SQL queries
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="SELECT * FROM table_name LIMIT 10;"
            className="font-mono min-h-[150px]"
          />
          <Button className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            Execute Query
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Table className="h-5 w-5" />
            Results
          </CardTitle>
          <CardDescription>
            Query results will appear here
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <div className="p-8 text-center text-muted-foreground">
              No query executed yet. Run a query to see results.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

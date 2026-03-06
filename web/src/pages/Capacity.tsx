import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap, Save } from 'lucide-react';

export function Capacity() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Capacity</h1>
        <p className="text-muted-foreground mt-2">
          Manage your API rate limits and capacity configuration.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Rate Limit Configuration
          </CardTitle>
          <CardDescription>
            Configure request limits per time window
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="requests-per-minute">Requests per minute</Label>
              <Input
                id="requests-per-minute"
                type="number"
                placeholder="60"
                defaultValue="60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="requests-per-hour">Requests per hour</Label>
              <Input
                id="requests-per-hour"
                type="number"
                placeholder="1000"
                defaultValue="1000"
              />
            </div>
          </div>
          <Button className="flex items-center gap-2">
            <Save className="h-4 w-4" />
            Save Configuration
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Usage</CardTitle>
          <CardDescription>Monitor your current API usage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Minute quota</span>
              <span className="text-sm font-medium">0 / 60</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div className="bg-primary h-2 rounded-full" style={{ width: '0%' }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Hour quota</span>
              <span className="text-sm font-medium">0 / 1000</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div className="bg-primary h-2 rounded-full" style={{ width: '0%' }} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

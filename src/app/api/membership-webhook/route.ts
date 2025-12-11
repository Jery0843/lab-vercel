// Webhook endpoint to receive expired member notifications and update status
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // Debug logging
    const authHeader = request.headers.get('authorization');
    const expectedSecret = `Bearer ${process.env.WEBHOOK_SECRET || 'default-secret'}`;
    
    console.log('Webhook Debug:');
    console.log('- Received auth:', authHeader);
    console.log('- Expected auth:', expectedSecret);
    console.log('- WEBHOOK_SECRET env:', process.env.WEBHOOK_SECRET);
    
    if (authHeader !== expectedSecret) {
      console.log('❌ Authorization failed');
      return NextResponse.json({ 
        error: 'Unauthorized',
        debug: {
          received: authHeader,
          expected: expectedSecret
        }
      }, { status: 401 });
    }
    
    console.log('✅ Authorization successful');

    const body = await request.json();
    
    if (body.type !== 'membership_expired' || !body.expired_members) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    const db = getDatabase();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const results = [];
    
    // Update each expired member's status to inactive
    for (const member of body.expired_members) {
      try {
        const prepared = await db.prepare(
          'UPDATE members SET status = ? WHERE email = ? AND status = ?'
        );
        
        const result = await prepared.bind('inactive', member.email, 'active').run();
        
        results.push({
          email: member.email,
          success: result.success,
          changes: result.changes
        });
        
        console.log(`Updated member ${member.email} to inactive status`);
      } catch (error) {
        console.error(`Failed to update member ${member.email}:`, error);
        results.push({
          email: member.email,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return NextResponse.json({
      message: 'Webhook processed successfully',
      processed: results.length,
      results
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
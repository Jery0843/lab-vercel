// API endpoint to trigger membership expiry check (for AI webhook service)
import { NextRequest, NextResponse } from 'next/server';
import { MembershipChecker } from '@/lib/membership-checker';

export async function POST(request: NextRequest) {
  try {
    // Verify API key for security
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== process.env.MEMBERSHIP_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/membership-webhook`;
    const checker = new MembershipChecker(webhookUrl);
    
    await checker.processExpiredMembers();
    
    return NextResponse.json({ 
      message: 'Membership check completed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Membership check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Membership checker API',
    endpoints: {
      'POST /api/check-expired-members': 'Trigger membership expiry check'
    }
  });
}
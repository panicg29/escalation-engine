import { connectDB } from "@/lib/db";
import AnalysisSession from "@/lib/models/AnalysisSession";
import Evaluation from "@/lib/models/Evaluation";

export async function GET() {
  try {
    await connectDB();
  } catch (error) {
    return Response.json(
      { error: "Failed to connect to MongoDB", detail: error.message },
      { status: 500 }
    );
  }

  try {
    const sessions = await AnalysisSession.find()
      .sort({ createdAt: -1 })
      .lean();

    const counts = await Evaluation.aggregate([
      { $group: { _id: "$sessionId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const payload = sessions.map((session) => ({
      ...session,
      _id: session._id.toString(),
      evaluationCount: countMap.get(session._id.toString()) || 0,
    }));

    return Response.json({ sessions: payload });
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch sessions", detail: error.message },
      { status: 500 }
    );
  }
}
export const dynamic = "force-dynamic";

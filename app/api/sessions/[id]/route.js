import { connectDB } from "@/lib/db";
import AnalysisSession from "@/lib/models/AnalysisSession";
import Evaluation from "@/lib/models/Evaluation";

export async function GET(request, { params }) {
  const url = new URL(request.url);
  const pathId = params?.id ?? "";
  const searchId = url.searchParams.get("id") ?? "";
  const sessionId = (pathId || searchId || "").toString().trim();
  console.log("sessions/[id] hit", {
    url: request.url,
    pathId,
    searchId,
    sessionId,
  });

  const { searchParams } = url;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const skip = parseInt(searchParams.get("skip") || "0", 10);

  try {
    await connectDB();
  } catch (error) {
    return Response.json(
      { error: "Failed to connect to MongoDB", detail: error.message },
      { status: 500 }
    );
  }

  try {
    if (!sessionId) {
      return Response.json({ error: "Invalid session id" }, { status: 400 });
    }

    const session = await AnalysisSession.findById(sessionId).lean();
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const [total, evaluations] = await Promise.all([
      Evaluation.countDocuments({ sessionId }),
      Evaluation.find({ sessionId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const payload = evaluations.map((ev) => ({
      ...ev,
      _id: ev._id.toString(),
      sessionId: ev.sessionId.toString(),
    }));

    return Response.json({
      session: {
        ...session,
        _id: session._id.toString(),
      },
      evaluations: payload,
      pagination: { total, limit, skip },
    });
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch session data", detail: error.message },
      { status: 500 }
    );
  }
}
export const dynamic = "force-dynamic";

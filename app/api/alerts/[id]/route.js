import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import Alert from "@/lib/models/Alert";
import { toAlertWireShape } from "@/lib/sentinel/alertBroadcast";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return Response.json({ error: "Invalid alert id" }, { status: 400 });
  }

  if (!teamId) {
    return Response.json({ error: "teamId query parameter is required." }, { status: 400 });
  }

  try {
    await connectDB();
  } catch (error) {
    return Response.json(
      { error: "Failed to connect to MongoDB", detail: error.message },
      { status: 500 }
    );
  }

  try {
    const doc = await Alert.findOne({ _id: id, teamId }).lean();
    if (!doc) {
      return Response.json({ error: "Alert not found" }, { status: 404 });
    }
    return Response.json(toAlertWireShape(doc));
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch alert", detail: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return Response.json({ error: "Invalid alert id" }, { status: 400 });
  }

  if (!teamId) {
    return Response.json({ error: "teamId query parameter is required." }, { status: 400 });
  }

  try {
    await connectDB();
  } catch (error) {
    return Response.json(
      { error: "Failed to connect to MongoDB", detail: error.message },
      { status: 500 }
    );
  }

  try {
    const result = await Alert.deleteOne({ _id: id, teamId });
    if (result.deletedCount === 0) {
      return Response.json({ error: "Alert not found" }, { status: 404 });
    }
    return Response.json({ ok: true, id, teamId });
  } catch (error) {
    return Response.json(
      { error: "Failed to delete alert", detail: error.message },
      { status: 500 }
    );
  }
}

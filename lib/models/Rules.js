import mongoose from "mongoose";

const RulesSchema = new mongoose.Schema(
  {
    teamId: { 
      type: String, 
      required: true, 
      unique: true 
    },
    
    // Escalation & Timing Configuration
    escalationTimeoutSeconds: { 
      type: Number, 
      default: 15
    },
    escalationPhone: { 
      type: String, 
      default: "" 
    },
    
    // VIP Users (instant escalation)
    vipUsers: { 
      type: [String], 
      default: [] 
    },
    
    // Blocked/Muted Users & Bots
    mutedUsers: { 
      type: [String], 
      default: [] 
    },
    muteBots: { 
      type: Boolean, 
      default: true 
    },
    
    // Channel Configuration
    monitoredChannels: { 
      type: [String], 
      default: [] // Empty means monitor all
    },
    ignoredChannels: { 
      type: [String], 
      default: [] 
    },
    
    // AI Sensitivity & Thresholds
    aiSensitivity: {
      type: String,
      enum: ["low", "balanced", "strict"],
      default: "balanced"
    },
    escalateThreshold: { 
      type: Number, 
      default: 8
    },
    logThreshold: { 
      type: Number, 
      default: 4
    },
    
    // Fatigue & Rate Limiting
    hourlyEscalationLimit: { 
      type: Number, 
      default: 12
    },
    cooldownMinutes: { 
      type: Number, 
      default: 30
    },
    
    // Behavior Toggles
    autoEscalate: { 
      type: Boolean, 
      default: true 
    },
    afterHoursBoost: { 
      type: Boolean, 
      default: true 
    },
    digestMode: { 
      type: Boolean, 
      default: false 
    },
    
    // Custom Rules & Overrides
    customRules: { 
      type: String, 
      default: "" 
    },
    
    // Metadata
    lastUpdatedBy: { 
      type: String, 
      default: "" 
    },
    updatedAt: { 
      type: Date, 
      default: Date.now 
    }
  },
  { 
    versionKey: false,
    timestamps: true 
  }
);

// Static method to get rules with fallback to defaults
RulesSchema.statics.getRulesForTeam = async function(teamId) {
  if (!teamId) return this.getDefaultRules();
  
  try {
    let rules = await this.findOne({ teamId }).lean();
    if (!rules) {
      return { ...this.getDefaultRules(), teamId };
    }

    // Old default was 60s while the pipeline UI counted 15s — align stored value.
    if (rules.escalationTimeoutSeconds === 60) {
      await this.updateOne(
        { teamId, escalationTimeoutSeconds: 60 },
        { escalationTimeoutSeconds: 15, updatedAt: new Date() }
      );
      return { ...rules, escalationTimeoutSeconds: 15 };
    }

    return rules;
  } catch (error) {
    console.error(`Failed to get/create rules for team ${teamId}:`, error);
    // Return defaults as fallback
    return { ...this.getDefaultRules(), teamId };
  }
};

// Static method for default configuration
RulesSchema.statics.getDefaultRules = function() {
  return {
    escalationTimeoutSeconds: 15,
    escalationPhone: "",
    vipUsers: [],
    mutedUsers: [],
    muteBots: true,
    monitoredChannels: [],
    ignoredChannels: [],
    aiSensitivity: "balanced",
    escalateThreshold: 8,
    logThreshold: 4,
    hourlyEscalationLimit: 12,
    cooldownMinutes: 30,
    autoEscalate: true,
    afterHoursBoost: true,
    digestMode: false,
    customRules: ""
  };
};

const MODEL_NAME = "Rules";

if (mongoose.models[MODEL_NAME]) {
  delete mongoose.models[MODEL_NAME];
}
if (mongoose.modelNames().includes(MODEL_NAME)) {
  mongoose.deleteModel(MODEL_NAME);
}

const Rules = mongoose.model(MODEL_NAME, RulesSchema);

export default Rules;
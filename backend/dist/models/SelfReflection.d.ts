import mongoose, { Document } from 'mongoose';
export interface ISelfReflection extends Document {
    userId: mongoose.Types.ObjectId;
    title: string;
    description: string;
    date: Date;
    type: 'pipo' | 'self';
    readAt: Date | null;
    imageName?: string;
    motivation?: string;
    linkedSessionId?: mongoose.Types.ObjectId;
    scenarioId?: mongoose.Types.ObjectId;
    level?: number;
    createdAt: Date;
    updatedAt: Date;
}
declare const SelfReflection: mongoose.Model<ISelfReflection, {}, {}, {}, mongoose.Document<unknown, {}, ISelfReflection, {}, {}> & ISelfReflection & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default SelfReflection;
//# sourceMappingURL=SelfReflection.d.ts.map
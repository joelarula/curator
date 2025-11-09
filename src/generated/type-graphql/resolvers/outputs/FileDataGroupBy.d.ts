import { FileDataAvgAggregate } from "../outputs/FileDataAvgAggregate";
import { FileDataCountAggregate } from "../outputs/FileDataCountAggregate";
import { FileDataMaxAggregate } from "../outputs/FileDataMaxAggregate";
import { FileDataMinAggregate } from "../outputs/FileDataMinAggregate";
import { FileDataSumAggregate } from "../outputs/FileDataSumAggregate";
export declare class FileDataGroupBy {
    id: number;
    name: string;
    mimeType: string;
    source: string | null;
    hash: string;
    size: number;
    content: Buffer | null;
    projectId: number;
    createdAt: Date;
    updatedAt: Date;
    _count: FileDataCountAggregate | null;
    _avg: FileDataAvgAggregate | null;
    _sum: FileDataSumAggregate | null;
    _min: FileDataMinAggregate | null;
    _max: FileDataMaxAggregate | null;
}

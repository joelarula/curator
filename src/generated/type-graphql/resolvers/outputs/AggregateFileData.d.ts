import { FileDataAvgAggregate } from "../outputs/FileDataAvgAggregate";
import { FileDataCountAggregate } from "../outputs/FileDataCountAggregate";
import { FileDataMaxAggregate } from "../outputs/FileDataMaxAggregate";
import { FileDataMinAggregate } from "../outputs/FileDataMinAggregate";
import { FileDataSumAggregate } from "../outputs/FileDataSumAggregate";
export declare class AggregateFileData {
    _count: FileDataCountAggregate | null;
    _avg: FileDataAvgAggregate | null;
    _sum: FileDataSumAggregate | null;
    _min: FileDataMinAggregate | null;
    _max: FileDataMaxAggregate | null;
}

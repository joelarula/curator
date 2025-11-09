import { ChunkAvgAggregate } from "../outputs/ChunkAvgAggregate";
import { ChunkCountAggregate } from "../outputs/ChunkCountAggregate";
import { ChunkMaxAggregate } from "../outputs/ChunkMaxAggregate";
import { ChunkMinAggregate } from "../outputs/ChunkMinAggregate";
import { ChunkSumAggregate } from "../outputs/ChunkSumAggregate";
export declare class AggregateChunk {
    _count: ChunkCountAggregate | null;
    _avg: ChunkAvgAggregate | null;
    _sum: ChunkSumAggregate | null;
    _min: ChunkMinAggregate | null;
    _max: ChunkMaxAggregate | null;
}

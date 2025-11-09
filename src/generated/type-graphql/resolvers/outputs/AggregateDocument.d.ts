import { DocumentCountAggregate } from "../outputs/DocumentCountAggregate";
import { DocumentMaxAggregate } from "../outputs/DocumentMaxAggregate";
import { DocumentMinAggregate } from "../outputs/DocumentMinAggregate";
export declare class AggregateDocument {
    _count: DocumentCountAggregate | null;
    _min: DocumentMinAggregate | null;
    _max: DocumentMaxAggregate | null;
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregateVectorStore = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const VectorStoreCountAggregate_1 = require("../outputs/VectorStoreCountAggregate");
const VectorStoreMaxAggregate_1 = require("../outputs/VectorStoreMaxAggregate");
const VectorStoreMinAggregate_1 = require("../outputs/VectorStoreMinAggregate");
let AggregateVectorStore = class AggregateVectorStore {
};
exports.AggregateVectorStore = AggregateVectorStore;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreCountAggregate_1.VectorStoreCountAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreCountAggregate_1.VectorStoreCountAggregate)
], AggregateVectorStore.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreMinAggregate_1.VectorStoreMinAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreMinAggregate_1.VectorStoreMinAggregate)
], AggregateVectorStore.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreMaxAggregate_1.VectorStoreMaxAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreMaxAggregate_1.VectorStoreMaxAggregate)
], AggregateVectorStore.prototype, "_max", void 0);
exports.AggregateVectorStore = AggregateVectorStore = tslib_1.__decorate([
    TypeGraphQL.ObjectType("AggregateVectorStore", {})
], AggregateVectorStore);

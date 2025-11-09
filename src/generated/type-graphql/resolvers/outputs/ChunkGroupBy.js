"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkGroupBy = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkAvgAggregate_1 = require("../outputs/ChunkAvgAggregate");
const ChunkCountAggregate_1 = require("../outputs/ChunkCountAggregate");
const ChunkMaxAggregate_1 = require("../outputs/ChunkMaxAggregate");
const ChunkMinAggregate_1 = require("../outputs/ChunkMinAggregate");
const ChunkSumAggregate_1 = require("../outputs/ChunkSumAggregate");
let ChunkGroupBy = class ChunkGroupBy {
};
exports.ChunkGroupBy = ChunkGroupBy;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkGroupBy.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], ChunkGroupBy.prototype, "text", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], ChunkGroupBy.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkGroupBy.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkGroupBy.prototype, "fileId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkGroupBy.prototype, "modelId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkCountAggregate_1.ChunkCountAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkCountAggregate_1.ChunkCountAggregate)
], ChunkGroupBy.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkAvgAggregate_1.ChunkAvgAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkAvgAggregate_1.ChunkAvgAggregate)
], ChunkGroupBy.prototype, "_avg", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkSumAggregate_1.ChunkSumAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkSumAggregate_1.ChunkSumAggregate)
], ChunkGroupBy.prototype, "_sum", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkMinAggregate_1.ChunkMinAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkMinAggregate_1.ChunkMinAggregate)
], ChunkGroupBy.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkMaxAggregate_1.ChunkMaxAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkMaxAggregate_1.ChunkMaxAggregate)
], ChunkGroupBy.prototype, "_max", void 0);
exports.ChunkGroupBy = ChunkGroupBy = tslib_1.__decorate([
    TypeGraphQL.ObjectType("ChunkGroupBy", {})
], ChunkGroupBy);

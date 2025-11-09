"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkAvgAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let ChunkAvgAggregate = class ChunkAvgAggregate {
};
exports.ChunkAvgAggregate = ChunkAvgAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Float, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkAvgAggregate.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Float, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkAvgAggregate.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Float, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkAvgAggregate.prototype, "fileId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Float, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkAvgAggregate.prototype, "modelId", void 0);
exports.ChunkAvgAggregate = ChunkAvgAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("ChunkAvgAggregate", {})
], ChunkAvgAggregate);

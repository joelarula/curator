"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkSumAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let ChunkSumAggregate = class ChunkSumAggregate {
};
exports.ChunkSumAggregate = ChunkSumAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkSumAggregate.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkSumAggregate.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkSumAggregate.prototype, "fileId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkSumAggregate.prototype, "modelId", void 0);
exports.ChunkSumAggregate = ChunkSumAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("ChunkSumAggregate", {})
], ChunkSumAggregate);

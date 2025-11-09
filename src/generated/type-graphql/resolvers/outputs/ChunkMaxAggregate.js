"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkMaxAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let ChunkMaxAggregate = class ChunkMaxAggregate {
};
exports.ChunkMaxAggregate = ChunkMaxAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkMaxAggregate.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkMaxAggregate.prototype, "text", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkMaxAggregate.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkMaxAggregate.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkMaxAggregate.prototype, "fileId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkMaxAggregate.prototype, "modelId", void 0);
exports.ChunkMaxAggregate = ChunkMaxAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("ChunkMaxAggregate", {})
], ChunkMaxAggregate);

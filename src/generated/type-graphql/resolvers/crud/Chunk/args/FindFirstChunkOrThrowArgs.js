"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindFirstChunkOrThrowArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkOrderByWithRelationInput_1 = require("../../../inputs/ChunkOrderByWithRelationInput");
const ChunkWhereInput_1 = require("../../../inputs/ChunkWhereInput");
const ChunkWhereUniqueInput_1 = require("../../../inputs/ChunkWhereUniqueInput");
const ChunkScalarFieldEnum_1 = require("../../../../enums/ChunkScalarFieldEnum");
let FindFirstChunkOrThrowArgs = class FindFirstChunkOrThrowArgs {
};
exports.FindFirstChunkOrThrowArgs = FindFirstChunkOrThrowArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkWhereInput_1.ChunkWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkWhereInput_1.ChunkWhereInput)
], FindFirstChunkOrThrowArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkOrderByWithRelationInput_1.ChunkOrderByWithRelationInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FindFirstChunkOrThrowArgs.prototype, "orderBy", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkWhereUniqueInput_1.ChunkWhereUniqueInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkWhereUniqueInput_1.ChunkWhereUniqueInput)
], FindFirstChunkOrThrowArgs.prototype, "cursor", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FindFirstChunkOrThrowArgs.prototype, "take", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FindFirstChunkOrThrowArgs.prototype, "skip", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkScalarFieldEnum_1.ChunkScalarFieldEnum], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FindFirstChunkOrThrowArgs.prototype, "distinct", void 0);
exports.FindFirstChunkOrThrowArgs = FindFirstChunkOrThrowArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], FindFirstChunkOrThrowArgs);

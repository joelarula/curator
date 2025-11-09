"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelCountChunksArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkWhereInput_1 = require("../../inputs/ChunkWhereInput");
let ModelCountChunksArgs = class ModelCountChunksArgs {
};
exports.ModelCountChunksArgs = ModelCountChunksArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkWhereInput_1.ChunkWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkWhereInput_1.ChunkWhereInput)
], ModelCountChunksArgs.prototype, "where", void 0);
exports.ModelCountChunksArgs = ModelCountChunksArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], ModelCountChunksArgs);

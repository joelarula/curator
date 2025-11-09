"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateManyChunkArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkUpdateManyMutationInput_1 = require("../../../inputs/ChunkUpdateManyMutationInput");
const ChunkWhereInput_1 = require("../../../inputs/ChunkWhereInput");
let UpdateManyChunkArgs = class UpdateManyChunkArgs {
};
exports.UpdateManyChunkArgs = UpdateManyChunkArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkUpdateManyMutationInput_1.ChunkUpdateManyMutationInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ChunkUpdateManyMutationInput_1.ChunkUpdateManyMutationInput)
], UpdateManyChunkArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkWhereInput_1.ChunkWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkWhereInput_1.ChunkWhereInput)
], UpdateManyChunkArgs.prototype, "where", void 0);
exports.UpdateManyChunkArgs = UpdateManyChunkArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], UpdateManyChunkArgs);

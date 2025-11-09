"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateOneChunkArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkUpdateInput_1 = require("../../../inputs/ChunkUpdateInput");
const ChunkWhereUniqueInput_1 = require("../../../inputs/ChunkWhereUniqueInput");
let UpdateOneChunkArgs = class UpdateOneChunkArgs {
};
exports.UpdateOneChunkArgs = UpdateOneChunkArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkUpdateInput_1.ChunkUpdateInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ChunkUpdateInput_1.ChunkUpdateInput)
], UpdateOneChunkArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkWhereUniqueInput_1.ChunkWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ChunkWhereUniqueInput_1.ChunkWhereUniqueInput)
], UpdateOneChunkArgs.prototype, "where", void 0);
exports.UpdateOneChunkArgs = UpdateOneChunkArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], UpdateOneChunkArgs);

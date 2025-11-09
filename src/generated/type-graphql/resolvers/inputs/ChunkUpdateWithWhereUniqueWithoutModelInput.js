"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkUpdateWithWhereUniqueWithoutModelInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkUpdateWithoutModelInput_1 = require("../inputs/ChunkUpdateWithoutModelInput");
const ChunkWhereUniqueInput_1 = require("../inputs/ChunkWhereUniqueInput");
let ChunkUpdateWithWhereUniqueWithoutModelInput = class ChunkUpdateWithWhereUniqueWithoutModelInput {
};
exports.ChunkUpdateWithWhereUniqueWithoutModelInput = ChunkUpdateWithWhereUniqueWithoutModelInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkWhereUniqueInput_1.ChunkWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ChunkWhereUniqueInput_1.ChunkWhereUniqueInput)
], ChunkUpdateWithWhereUniqueWithoutModelInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkUpdateWithoutModelInput_1.ChunkUpdateWithoutModelInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ChunkUpdateWithoutModelInput_1.ChunkUpdateWithoutModelInput)
], ChunkUpdateWithWhereUniqueWithoutModelInput.prototype, "data", void 0);
exports.ChunkUpdateWithWhereUniqueWithoutModelInput = ChunkUpdateWithWhereUniqueWithoutModelInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkUpdateWithWhereUniqueWithoutModelInput", {})
], ChunkUpdateWithWhereUniqueWithoutModelInput);

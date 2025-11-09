"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkUpdateManyWithoutFileNestedInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkScalarWhereInput_1 = require("../inputs/ChunkScalarWhereInput");
const ChunkUpdateManyWithWhereWithoutFileInput_1 = require("../inputs/ChunkUpdateManyWithWhereWithoutFileInput");
const ChunkUpdateWithWhereUniqueWithoutFileInput_1 = require("../inputs/ChunkUpdateWithWhereUniqueWithoutFileInput");
const ChunkWhereUniqueInput_1 = require("../inputs/ChunkWhereUniqueInput");
let ChunkUpdateManyWithoutFileNestedInput = class ChunkUpdateManyWithoutFileNestedInput {
};
exports.ChunkUpdateManyWithoutFileNestedInput = ChunkUpdateManyWithoutFileNestedInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereUniqueInput_1.ChunkWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkUpdateManyWithoutFileNestedInput.prototype, "set", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereUniqueInput_1.ChunkWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkUpdateManyWithoutFileNestedInput.prototype, "disconnect", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereUniqueInput_1.ChunkWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkUpdateManyWithoutFileNestedInput.prototype, "delete", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereUniqueInput_1.ChunkWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkUpdateManyWithoutFileNestedInput.prototype, "connect", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkUpdateWithWhereUniqueWithoutFileInput_1.ChunkUpdateWithWhereUniqueWithoutFileInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkUpdateManyWithoutFileNestedInput.prototype, "update", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkUpdateManyWithWhereWithoutFileInput_1.ChunkUpdateManyWithWhereWithoutFileInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkUpdateManyWithoutFileNestedInput.prototype, "updateMany", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkScalarWhereInput_1.ChunkScalarWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkUpdateManyWithoutFileNestedInput.prototype, "deleteMany", void 0);
exports.ChunkUpdateManyWithoutFileNestedInput = ChunkUpdateManyWithoutFileNestedInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkUpdateManyWithoutFileNestedInput", {})
], ChunkUpdateManyWithoutFileNestedInput);
